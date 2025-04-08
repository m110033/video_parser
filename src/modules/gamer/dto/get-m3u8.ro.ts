export class GetM3u8Ro {
  constructor(
    public readonly success: boolean,
    public readonly sn: string,
    public readonly m3u8Url: string,
    public readonly referer: string,
  ) {}
}
