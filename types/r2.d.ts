declare module 'r2' {
  declare const exports: {
    get(url: string): {
      response: Promise<Response>;
      json: Promise<Record<string, unknown>>;
    };
    delete(url: string): Promise<void>;
  };
  export = exports;
}
