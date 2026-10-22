// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Priors: pi_i proportional to max(s_i, s_floor)^(1/tau), after a fixed share per control.

/** One selectable option. */
export interface Option { // a reply or a control
  id: string; // stable identifier, reported on commit
  score: number; // model score in [0, 1]; ignored for controls
  control?: boolean; // true for Undo, More, Spell, Help and the like
} // end of Option

/** The parameters the priors depend on. */
export interface PriorConfig { // subset of the engine configuration
  priorFloor: number; // s_floor: keeps every reply reachable
  temperature: number; // tau: above 1 flattens, below 1 sharpens
  controlShare: number; // fixed prior of each control option
} // end of PriorConfig

/** Prior probability of each option, in option order, summing to 1. */
export function priors(options: readonly Option[], c: PriorConfig): number[] { // scores to priors
  const weights = options.map((o) => (o.control ? 0 : Math.max(o.score, c.priorFloor) ** (1 / c.temperature))); // reply weights
  const total = weights.reduce((s, w) => s + w, 0); // sum of reply weights (0 when there are no replies)
  const replyMass = 1 - c.controlShare * options.filter((o) => o.control).length; // mass left for replies
  if (total > 0 && replyMass <= 0) throw new Error('switchclock: control shares leave no prior mass for replies'); // misconfiguration
  const raw = options.map((o, i) => (o.control ? c.controlShare : (replyMass * weights[i]!) / total)); // shares
  const sum = raw.reduce((s, p) => s + p, 0); // 1, except when there are only controls
  return raw.map((p) => p / sum); // renormalise
} // end of priors
