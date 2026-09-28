import { publicName } from './personName';

describe('publicName', () => {
  it('prefers the chosen name', () => {
    expect(publicName({ name: '  Zeynep Demir ', username: 'zd', email: 'z@x.com' })).toBe('Zeynep Demir');
  });
  it('leaves room for the username when there is no name', () => {
    expect(publicName({ name: null, username: 'zeynepd', email: 'z@x.com' })).toBeNull();
  });
  it('falls back to the email local part', () => {
    expect(publicName({ name: ' ', username: null, email: 'zeynep.demir@gmail.com' })).toBe('zeynep.demir');
  });
});
