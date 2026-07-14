import type { Challenge } from "@/lib/domain";

export function publicChallenge(challenge: Challenge) {
  const blueprint = challenge.disciplineSnapshot?.generationContext?.blueprint;
  const {
    solution: _solution,
    antiGenericRequirement: _antiGenericRequirement,
    userId: _userId,
    createdAt: _createdAt,
    disciplineSnapshot: _disciplineSnapshot,
    ...safe
  } = challenge;
  void [_solution, _antiGenericRequirement, _userId, _createdAt, _disciplineSnapshot];
  return {
    ...safe,
    assessment: blueprint
      ? {
          modeId: blueprint.modeId,
          modeLabel: blueprint.modeLabel,
          focus: blueprint.focus,
          interaction: blueprint.interaction,
          deliverable: blueprint.deliverable,
          responseSections: blueprint.responseSections,
        }
      : undefined,
  };
}
