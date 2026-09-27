export interface ChatAttachmentStoragePort {
  createUploadUrl(key: string, contentType: string): Promise<string>;
  createDownloadUrl(key: string): Promise<string>;
}
