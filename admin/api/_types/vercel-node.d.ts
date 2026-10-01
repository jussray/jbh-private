declare module "@vercel/node" {
  export type VercelRequest = import("node:http").IncomingMessage & {
    query: Record<string, string | string[] | undefined>;
    cookies: Record<string, string | undefined>;
    body: any;
  };

  export type VercelResponse = import("node:http").ServerResponse & {
    status(code: number): VercelResponse;
    json(body: any): VercelResponse;
    send(body: any): VercelResponse;
    redirect(url: string): VercelResponse;
    redirect(status: number, url: string): VercelResponse;
  };
}
