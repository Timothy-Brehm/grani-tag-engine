import { describe, expect, it } from 'vitest';
import { EngineRegistry } from './registry';
import { createEngineState, toEngineContext } from './state';
import { instantiateEntity } from './entity';
import { reduceEngineState } from './reduce';
import { ENGINE_VERSION } from './version';

describe('lock-tag', () => {
  it('exports 0.3.0.5', () => {
    expect(ENGINE_VERSION).toBe('0.3.0.5');
  });

  it('is a grant-tag synonym (no special lock semantics)', () => {
    const registry = new EngineRegistry().createBuiltinAdaptors();
    registry.registerEntityDefinition({
      id: 'hero',
      actions: [
        {
          name: 'choose-attack',
          requirements: [
            { type: 'tag', tagName: 'Decision_Squirrel', exists: false },
          ],
          immediateEffects: [],
          requiredEffects: [
            { type: 'grant-tag', name: 'Decision_Squirrel_Attack', strength: 1 },
          ],
          optionalEffects: [
            { type: 'lock-tag', name: 'Decision_Squirrel', strength: 1 },
          ],
        },
      ],
    });
    const hero = instantiateEntity(
      registry.getEntityDefinition('hero')!,
      'hero',
    );
    let state = createEngineState({
      entities: [hero],
      primaryEntityId: 'hero',
    });
    const host = { tagCatalog: new Map() };
    state = reduceEngineState(
      state,
      {
        type: 'execute-action',
        action: registry.getEntityDefinition('hero')!.actions![0],
        actorEntityId: 'hero',
        sourceEntityId: 'hero',
      },
      { registry, host },
    );

    const after = state.entities.get('hero')!;
    expect(after.tags.has('Decision_Squirrel_Attack')).toBe(true);
    expect(after.tags.has('Decision_Squirrel')).toBe(true);

    const ctx = toEngineContext(state, host, {
      actorEntityId: 'hero',
      sourceEntityId: 'hero',
    });
    expect(
      registry.isRequirementMet(
        { type: 'tag', tagName: 'Decision_Squirrel', exists: false },
        ctx,
      ),
    ).toBe(false);
  });
});
