// TODO: Hata siniflarini HTTP status koduna ceviren merkezi mapper
export function mapErrorToHttpStatus(_error: unknown): number {
  return 500;
}
