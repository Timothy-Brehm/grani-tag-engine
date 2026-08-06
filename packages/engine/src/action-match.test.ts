import { describe, expect, it } from 'vitest';
import { typesIntersect, actionMatchesFilter } from './action-match';

describe('typesIntersect', () => {
  it('requires all filter types on the member (AND within)', () => {
    expect(typesIntersect(['Liquid'], ['Liquid', 'Food'])).toBe(true);
    expect(typesIntersect(['Liquid', 'Food'], ['Liquid', 'Food'])).toBe(true);
    expect(typesIntersect(['Liquid', 'Food'], ['Liquid'])).toBe(false);
    expect(typesIntersect(['Food'], ['Liquid'])).toBe(false);
  });

  it('treats undefined filter as unconstrained and [] as never', () => {
    expect(typesIntersect(undefined, ['Liquid'])).toBe(true);
    expect(typesIntersect([], ['Liquid'])).toBe(false);
  });
});

describe('actionMatchesFilter', () => {
  it('ANDs actionName with actionTypes', () => {
    expect(
      actionMatchesFilter(
        { actionName: 'Explore', actionTypes: ['Explore'] },
        { name: 'Explore', types: ['Explore'] },
      ),
    ).toBe(true);
    expect(
      actionMatchesFilter(
        { actionName: 'Explore', actionTypes: ['Scout'] },
        { name: 'Explore', types: ['Explore'] },
      ),
    ).toBe(false);
  });
});
