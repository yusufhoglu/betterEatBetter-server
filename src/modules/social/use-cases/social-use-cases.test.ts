import { ForbiddenError } from '../../../shared/errors/ForbiddenError';
import { NotFoundError } from '../../../shared/errors/NotFoundError';
import { ValidationError } from '../../../shared/errors/ValidationError';
import { InMemorySocialFeedRepository } from '../test-utils/fakes/InMemorySocialFeedRepository';
import { AddComment } from './AddComment';
import { CreatePost } from './CreatePost';
import { DeletePost } from './DeletePost';
import { GetComments } from './GetComments';
import { GetFeed } from './GetFeed';
import { GetPost } from './GetPost';
import { ToggleCommentLike } from './ToggleCommentLike';
import { TogglePostLike } from './TogglePostLike';
import { UpdatePostCaption } from './UpdatePostCaption';

const ALICE_PHOTO = '11111111-1111-1111-1111-111111111111';
const BOB_PHOTO = '22222222-2222-2222-2222-222222222222';

function setup() {
  const repo = new InMemorySocialFeedRepository(
    new Map([
      ['alice', 'Alice'],
      ['bob', 'Bob'],
    ]),
  );
  return {
    repo,
    createPost: new CreatePost(repo),
    updateCaption: new UpdatePostCaption(repo),
    deletePost: new DeletePost(repo),
    togglePostLike: new TogglePostLike(repo),
    getFeed: new GetFeed(repo),
    getPost: new GetPost(repo),
    getComments: new GetComments(repo),
    addComment: new AddComment(repo),
    toggleCommentLike: new ToggleCommentLike(repo),
  };
}

describe('social use-cases', () => {
  it('shares an owned meal photo and returns it resolved for the author', async () => {
    const { createPost } = setup();
    const post = await createPost.execute({
      authorId: 'alice',
      mealPhotoId: ALICE_PHOTO,
      caption: 'lunch  ',
    });

    expect(post.authorName).toBe('Alice');
    expect(post.caption).toBe('lunch');
    expect(post.photoUrl).toContain(ALICE_PHOTO);
    expect(post.isMine).toBe(true);
    expect(post.edited).toBe(false);
    expect(post.nutrition).toBeNull();
  });

  it('carries the meal nutrition when the photo has a recognised result', async () => {
    const { repo, createPost, getFeed } = setup();
    repo.setNutrition(ALICE_PHOTO, { calories: 420, proteinG: 32, carbsG: 45, fatG: 12 });
    await createPost.execute({ authorId: 'alice', mealPhotoId: ALICE_PHOTO, caption: '' });

    const page = await getFeed.execute({ viewerId: 'bob' });
    expect(page.items[0]?.nutrition).toEqual({
      calories: 420,
      proteinG: 32,
      carbsG: 45,
      fatG: 12,
    });
  });

  it('rejects sharing the same photo twice', async () => {
    const { createPost } = setup();
    await createPost.execute({ authorId: 'alice', mealPhotoId: ALICE_PHOTO, caption: '' });
    await expect(
      createPost.execute({ authorId: 'alice', mealPhotoId: ALICE_PHOTO, caption: '' }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('rejects a caption over the limit', async () => {
    const { createPost } = setup();
    await expect(
      createPost.execute({ authorId: 'alice', mealPhotoId: ALICE_PHOTO, caption: 'x'.repeat(281) }),
    ).rejects.toThrow(ValidationError);
  });

  it('returns the newest-first feed with viewer-resolved flags', async () => {
    const { createPost, togglePostLike, getFeed } = setup();
    const first = await createPost.execute({ authorId: 'alice', mealPhotoId: ALICE_PHOTO, caption: '' });
    const second = await createPost.execute({ authorId: 'bob', mealPhotoId: BOB_PHOTO, caption: '' });
    await togglePostLike.execute({ userId: 'alice', postId: second.id, liked: true });

    const page = await getFeed.execute({ viewerId: 'alice' });
    expect(page.items.map((p) => p.id)).toEqual([second.id, first.id]);
    expect(page.items[0]?.likedByMe).toBe(true);
    expect(page.items[0]?.likeCount).toBe(1);
    expect(page.items[0]?.isMine).toBe(false);
  });

  it('only lets the author edit or delete a post', async () => {
    const { createPost, updateCaption, deletePost } = setup();
    const post = await createPost.execute({ authorId: 'alice', mealPhotoId: ALICE_PHOTO, caption: '' });

    await expect(
      updateCaption.execute({ authorId: 'bob', postId: post.id, caption: 'hacked' }),
    ).rejects.toThrow(ForbiddenError);
    await expect(deletePost.execute({ authorId: 'bob', postId: post.id })).rejects.toThrow(ForbiddenError);

    const edited = await updateCaption.execute({ authorId: 'alice', postId: post.id, caption: 'new note' });
    expect(edited.caption).toBe('new note');
    expect(edited.edited).toBe(true);
  });

  it('toggles a like idempotently', async () => {
    const { createPost, togglePostLike } = setup();
    const post = await createPost.execute({ authorId: 'alice', mealPhotoId: ALICE_PHOTO, caption: '' });

    await togglePostLike.execute({ userId: 'bob', postId: post.id, liked: true });
    const twice = await togglePostLike.execute({ userId: 'bob', postId: post.id, liked: true });
    expect(twice.likeCount).toBe(1);

    const off = await togglePostLike.execute({ userId: 'bob', postId: post.id, liked: false });
    expect(off.likeCount).toBe(0);
  });

  it('adds comments and flattens replies to one level', async () => {
    const { createPost, addComment, getComments } = setup();
    const post = await createPost.execute({ authorId: 'alice', mealPhotoId: ALICE_PHOTO, caption: '' });

    const top = await addComment.execute({ authorId: 'bob', postId: post.id, text: 'looks great' });
    const reply = await addComment.execute({
      authorId: 'alice',
      postId: post.id,
      text: 'thanks!',
      parentId: top.id,
    });
    const replyToReply = await addComment.execute({
      authorId: 'bob',
      postId: post.id,
      text: 'np',
      parentId: reply.id,
    });

    expect(reply.parentId).toBe(top.id);
    expect(replyToReply.parentId).toBe(top.id);

    const comments = await getComments.execute({ viewerId: 'alice', postId: post.id });
    expect(comments).toHaveLength(3);
    expect(comments[0]?.text).toBe('looks great');
  });

  it('rejects an empty comment and a missing post', async () => {
    const { createPost, addComment, getComments } = setup();
    const post = await createPost.execute({ authorId: 'alice', mealPhotoId: ALICE_PHOTO, caption: '' });

    await expect(addComment.execute({ authorId: 'bob', postId: post.id, text: '  ' })).rejects.toThrow(
      ValidationError,
    );
    await expect(addComment.execute({ authorId: 'bob', postId: 'nope', text: 'hi' })).rejects.toThrow(
      NotFoundError,
    );
    await expect(getComments.execute({ viewerId: 'bob', postId: 'nope' })).rejects.toThrow(NotFoundError);
  });

  it('reflects comment count on the post after commenting', async () => {
    const { createPost, addComment, getPost } = setup();
    const post = await createPost.execute({ authorId: 'alice', mealPhotoId: ALICE_PHOTO, caption: '' });
    await addComment.execute({ authorId: 'bob', postId: post.id, text: 'yum' });

    const refreshed = await getPost.execute({ viewerId: 'alice', postId: post.id });
    expect(refreshed.commentCount).toBe(1);
  });

  it('toggles a comment like', async () => {
    const { createPost, addComment, toggleCommentLike } = setup();
    const post = await createPost.execute({ authorId: 'alice', mealPhotoId: ALICE_PHOTO, caption: '' });
    const comment = await addComment.execute({ authorId: 'bob', postId: post.id, text: 'yum' });

    const liked = await toggleCommentLike.execute({ userId: 'alice', commentId: comment.id, liked: true });
    expect(liked.likeCount).toBe(1);
    expect(liked.likedByMe).toBe(true);
  });

  it('404s a missing post lookup', async () => {
    const { getPost } = setup();
    await expect(getPost.execute({ viewerId: 'alice', postId: 'nope' })).rejects.toThrow(NotFoundError);
  });
});
