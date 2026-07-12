import type { Challenge } from "@/lib/domain";

export function publicChallenge(challenge: Challenge) {
  const {
    solution: _solution,
    antiGenericRequirement: _antiGenericRequirement,
    userId: _userId,
    createdAt: _createdAt,
    disciplineSnapshot: _disciplineSnapshot,
    ...safe
  } = challenge;
  return safe;
}
