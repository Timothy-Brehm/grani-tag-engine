export type FreeRequirement = { readonly type: 'free' };
export type ForbiddenRequirement = { readonly type: 'forbidden' };
export type TagRequirement = {
  readonly type: 'tag';
  readonly tagName: string;
  readonly exists: boolean;
};

export type BuiltinRequirement =
  | FreeRequirement
  | ForbiddenRequirement
  | TagRequirement;

export type Requirement =
  | BuiltinRequirement
  | { readonly type: string; readonly [key: string]: unknown };
