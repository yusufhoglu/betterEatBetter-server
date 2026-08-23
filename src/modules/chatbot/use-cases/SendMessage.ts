// TODO: Mesaj gonderip streaming yanit ureten ana use-case (AsyncIterable doner); trace_id = conversationId, ayrica her istekte messageId -- bkz SS6
export class SendMessage {
  async execute(): Promise<AsyncIterable<unknown>> {
    throw new Error('Not implemented: SendMessage');
  }
}
