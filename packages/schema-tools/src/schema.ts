export interface Schema {
  name?: string;
  type: string;
  properties?: {
    [key: string]: Schema;
  };
  items?: Schema | Schema[];
  $ref?: string;
  oneOf?: Schema[];
  allOf?: Schema[];
  anyOf?: Schema[];
  const?: string;
  default?: string;
}
