export interface XcodeProjectObjectWithId<T> {
  id: string;
  obj: T;
  comment?: string;
}
