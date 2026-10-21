// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Reply pipeline post-processing (plan §4.6): validation, trimming, length cap, de-duplication, merge and priors.

import { describe, expect, it } from 'vitest'; // test API
import { BANNED_TERMS, cleanDrafts, DEFAULT_REPLIES, defaultCandidates, dropBanned, optionCandidates, questionKind, toCandidates } from '../src/domain/candidates.ts'; // tested
import { REPLY_COUNT } from '../src/domain/model.ts'; // eight per question

describe('cleanDrafts', () => { // raw model output to drafts
  it('rejects an output without a candidates list', () => { // envelope validation
    expect(cleanDrafts(null)).toEqual([]); // nothing
    expect(cleanDrafts({ replies: [] })).toEqual([]); // wrong key
    expect(cleanDrafts({ candidates: 'Yes' })).toEqual([]); // not a list
  }); // end of the case

  it('drops invalid candidates and keeps the valid ones', () => { // per-candidate validation
    const raw = { candidates: [ // a mixed list
      { text: 'Tea, please', intent: 'choice', score: 0.6 }, // valid
      { text: 'Coffee', intent: 'maybe', score: 0.5 }, // unknown intent
      { text: 'Water', intent: 'choice', score: 1.5 }, // score out of range
      { text: 42, intent: 'yes', score: 0.2 }, // text not a string
      'No', // not an object
    ] }; // end of the list
    expect(cleanDrafts(raw)).toEqual([{ text: 'Tea, please', intent: 'choice', score: 0.6 }]); // only the valid one
  }); // end of the case

  it('trims whitespace, caps the length at 60 and drops empty text', () => { // sanitising
    const long = 'x'.repeat(61); // one over the cap
    const raw = { candidates: [{ text: '  Yes,\n  please ', intent: 'yes', score: 0.4 }, { text: long, intent: 'no', score: 0.3 }, { text: '   ', intent: 'no', score: 0.2 }, { text: 'y'.repeat(60), intent: 'no', score: 0.1 }] }; // cases
    expect(cleanDrafts(raw).map((d) => d.text)).toEqual(['Yes, please', 'y'.repeat(60)]); // trimmed; 60 kept; 61 and blank dropped
  }); // end of the case

  it('sorts by score and de-duplicates case-insensitively, keeping the best score', () => { // ranking
    const raw = { candidates: [{ text: 'not now', intent: 'later', score: 0.1 }, { text: 'Yes', intent: 'yes', score: 0.5 }, { text: 'Not Now', intent: 'later', score: 0.3 }] }; // a duplicate
    expect(cleanDrafts(raw)).toEqual([{ text: 'Yes', intent: 'yes', score: 0.5 }, { text: 'Not Now', intent: 'later', score: 0.3 }]); // best of each
  }); // end of the case
}); // end of cleanDrafts

describe('dropBanned', () => { // plan §4.6: no profanity
  const draft = (text: string) => ({ text, intent: 'social' as const, score: 0.5 }); // a draft with this text

  it('drops drafts that contain a listed term as a whole word, in any case, and counts them', () => { // whole words only
    const drafts = [draft('Frog legs'), draft('Frogman'), draft('Leapfrog'), draft('I like FROG'), draft('Tea, please')]; // two with the word; two with it inside a longer word
    expect(dropBanned(drafts, ['frog'])).toEqual({ kept: [draft('Frogman'), draft('Leapfrog'), draft('Tea, please')], dropped: 2 }); // the rest, in order
  }); // end of the case

  it('treats a term as plain text, not as a pattern', () => { // regex metacharacters are escaped
    expect(dropBanned([draft('a+b'), draft('aab')], ['a+b']).kept).toEqual([draft('aab')]); // "+" is a plus sign
  }); // end of the case

  it('uses BANNED_TERMS by default', () => { // the one list
    expect(dropBanned([draft(`Oh ${BANNED_TERMS[0]}`), draft('Oh dear')])).toEqual({ kept: [draft('Oh dear')], dropped: 1 }); // the listed word goes
  }); // end of the case

  it('also drops the simple variants of a term: -s, -es, -ed, -ing and -er', () => { // inflected forms
    const drafts = ['Kicks', 'Kicked', 'kicking', 'Kicker', 'Two PUSHES', 'Kickoff', 'Kickers', 'Sidekicks'].map(draft); // five variants, then three other words
    expect(dropBanned(drafts, ['kick', 'push'])).toEqual({ kept: [draft('Kickoff'), draft('Kickers'), draft('Sidekicks')], dropped: 5 }); // one suffix, whole words only, still
    expect(dropBanned(['Damned', 'Pissing', 'Bitches', 'Wankers', 'Scrap'].map(draft)).kept).toEqual([draft('Scrap')]); // the real list
    expect(dropBanned(['Crapped', "I'm not shitting you", 'Shitter', 'Kickked'].map(draft), [...BANNED_TERMS, 'kick']).kept).toEqual([]); // a doubled last letter before -ed, -ing and -er
  }); // end of the case

  it('keeps words that only start like a term with a doubled last letter', () => { // still whole words
    expect(dropBanned(['Crappy', 'Kickkk'].map(draft), ['crap', 'kick']).kept).toEqual([draft('Crappy'), draft('Kickkk')]); // no listed suffix after the doubling
  }); // end of the case
}); // end of dropBanned

describe('toCandidates', () => { // merge with defaults and priors
  it('returns the eight defaults, Yes, No and Not now first, when the model gave nothing', () => { // FR-02
    const c = defaultCandidates('Shall I open the window?'); // no model output, for a yes/no question
    expect(c).toHaveLength(REPLY_COUNT); // a full grid
    expect(c.slice(0, 3).map((x) => x.text)).toEqual(['Yes, please', 'No, thanks', 'Not now']); // shown at once
    expect(c.every((x) => x.source === 'default')).toBe(true); // all defaults
  }); // end of the case

  it('keeps the model candidates and fills up with defaults that are not duplicates', () => { // merge
    const model = [{ text: 'Tea, please', intent: 'choice' as const, score: 0.6 }, { text: 'yes, please', intent: 'yes' as const, score: 0.2 }]; // two drafts, one a default
    const c = toCandidates(model); // merged
    expect(c).toHaveLength(REPLY_COUNT); // eight
    expect(c.filter((x) => x.source === 'llm').map((x) => x.text)).toEqual(['Tea, please', 'yes, please']); // both model drafts
    expect(c.map((x) => x.text.toLowerCase()).filter((t) => t === 'yes, please')).toHaveLength(1); // the default "Yes, please" not repeated
    expect(c.filter((x) => x.source === 'default')).toHaveLength(6); // six defaults fill the grid
  }); // end of the case

  it('uses only the best eight model candidates', () => { // cap at the grid size
    const model = Array.from({ length: 10 }, (_, i) => ({ text: `Reply ${i}`, intent: 'later' as const, score: 1 - i / 10 })); // ten drafts, best first; later, so none gives way to "Not now"
    const c = toCandidates(model); // merged
    expect(c.map((x) => x.text)).toEqual(model.slice(0, 8).map((d) => d.text)); // the first eight, no defaults
  }); // end of the case

  it('orders by score and computes priors that sum to 1 and follow the scores', () => { // priors from scores
    const c = toCandidates([{ text: 'Coffee, please', intent: 'choice', score: 0.9 }]); // one strong model candidate
    expect(c[0]!.text).toBe('Coffee, please'); // best guess first
    for (let i = 1; i < c.length; i++) expect(c[i - 1]!.score).toBeGreaterThanOrEqual(c[i]!.score); // descending scores
    expect(c.reduce((s, x) => s + x.prior, 0)).toBeCloseTo(1, 12); // a distribution
    const total = 0.9 + DEFAULT_REPLIES.slice(0, 7).reduce((s, d) => s + d.score, 0); // tau = 1 and every score above the floor
    expect(c[0]!.prior).toBeCloseTo(0.9 / total, 12); // proportional to the score
  }); // end of the case

  it('replaces the weakest candidate with "Not now" when no candidate has intent later', () => { // plan §4.6: a later reply is kept
    const model = Array.from({ length: 8 }, (_, i) => ({ text: `Reply ${i}`, intent: 'choice' as const, score: 0.9 - i / 10 })); // eight drafts, none later
    const c = toCandidates(model); // merged
    expect(c.map((x) => x.text)).toEqual([...model.slice(0, 7).map((d) => d.text), 'Not now']); // the lowest-scored draft gave way, order by score
    expect(c[7]).toMatchObject({ text: 'Not now', intent: 'later', source: 'default', score: 0.12 }); // the default as it is
    expect(c.reduce((s, x) => s + x.prior, 0)).toBeCloseTo(1, 12); // priors over the new eight
  }); // end of the case

  it('replaces the lowest-scored candidate, not the last one listed', () => { // a default fill can outscore a model draft
    const model = [...Array.from({ length: 6 }, (_, i) => ({ text: `Reply ${i}`, intent: 'choice' as const, score: 0.9 - i / 10 })), { text: 'Reply 6', intent: 'choice' as const, score: 0.05 }]; // seven drafts, none later; "Yes, please" (0.3) fills the eighth place
    expect(toCandidates(model).map((x) => x.text)).toEqual([...model.slice(0, 6).map((d) => d.text), 'Yes, please', 'Not now']); // the 0.05 draft gave way
  }); // end of the case

  it('uses "Ask me later" when "Not now" is already there with another intent', () => { // no duplicate text
    const model = [...Array.from({ length: 7 }, (_, i) => ({ text: `Reply ${i}`, intent: 'choice' as const, score: 0.9 - i / 10 })), { text: 'Not now', intent: 'no' as const, score: 0.5 }]; // eight drafts, none later
    expect(toCandidates(model).map((x) => x.text)).toContain('Ask me later'); // the next later default
  }); // end of the case

  it('leaves a list that already has a later candidate unchanged', () => { // nothing to add
    const model = Array.from({ length: 8 }, (_, i) => ({ text: `Reply ${i}`, intent: i === 7 ? ('later' as const) : ('choice' as const), score: 0.9 - i / 10 })); // the weakest is later
    expect(toCandidates(model).map((x) => x.text)).toEqual(model.map((d) => d.text)); // the model's eight, as they were
  }); // end of the case

  it("skips a default that a picked reply already says, such as Not sure next to \"I'm not sure\"", () => { // near-duplicates
    const c = toCandidates([{ text: "I'm not sure", intent: 'clarify', score: 0.5 }], DEFAULT_REPLIES.slice(2, 4)); // Not now and Not sure to fill from
    expect(c.map((x) => x.text)).toEqual(["I'm not sure", 'Not now']); // one "not sure", not two
  }); // end of the case

  it('fills up only from the defaults it is given', () => { // the defaults that fit the question
    const c = toCandidates([{ text: 'Tea, please', intent: 'choice', score: 0.6 }], DEFAULT_REPLIES.slice(2, 4)); // two defaults to fill from
    expect(c.map((x) => x.text)).toEqual(['Tea, please', 'Not now', 'Not sure']); // three candidates, not eight
  }); // end of the case
}); // end of toCandidates

describe('defaults that fit the question', () => { // Yes, No and Not now only for yes/no questions
  const texts = (question: string) => defaultCandidates(question).map((c) => c.text); // the defaults pushed at once
  const intents = (question: string) => defaultCandidates(question).map((c) => c.intent); // and their intents

  it('offers Yes, No and Not now first for a yes/no question: anything that is neither a choice nor open', () => { // yes/no
    for (const q of ['Shall I open the window?', 'Do you want the radio on?', 'Is it too warm in here?', 'Can I get you anything?', 'Would you like a blanket?', "Don't you want lunch?", 'Tea?', 'Whatever next?']) { // yes/no questions, with no auxiliary verb in the last two
      expect(questionKind(q)).toBe('yesno'); // classified
      expect(texts(q)).toEqual(DEFAULT_REPLIES.map((d) => d.text)); // all eight defaults, Yes, No and Not now first
    } // end of the questions
  }); // end of the case

  it('treats "... or not?" as yes/no, not as a choice', () => { // a yes/no question in disguise
    for (const q of ['Would you like tea or not?', 'Tea or not?', 'Shall we go out, or not ?', 'Now, or not?']) expect(questionKind(q)).toBe('yesno'); // or not, at the end
  }); // end of the case

  it('ignores a leading name and comma', () => { // "Sam, ..." asks the same question
    expect(['Sam, would you like a blanket?', 'Sam, tea or coffee?', 'Sam, what shall we watch?', 'Sam, tea or not?'].map(questionKind)).toEqual(['yesno', 'choice', 'open', 'yesno']); // as without the name
  }); // end of the case

  const FOUR = ['Not sure', 'You decide', 'Tell me more', 'Not now']; // the defaults of a choice or open question, best first

  it('offers four defaults, without Yes or No, for a choice question: one with " or "', () => { // choice
    for (const q of ['Would you like tea or coffee?', 'Tea or coffee?', 'Shall we watch a film or the news?', 'What would you like, tea or coffee?', 'Now, or later?', 'Tea, or coffee?']) { // choice questions: one starting with a wh-word, two with a comma before " or "
      expect(questionKind(q)).toBe('choice'); // classified
      expect(texts(q)).toEqual(FOUR); // Not sure, You decide, Tell me more, Not now
      expect(intents(q)).not.toContain('yes'); // no Yes
      expect(intents(q)).not.toContain('no'); // no No
    } // end of the questions
  }); // end of the case

  it('offers the same four defaults for an open question: one starting with a wh-word', () => { // open
    for (const q of ['What shall we watch tonight?', 'Which one?', 'Who called?', 'Whom shall we invite?', 'Whose coat is this?', 'Where shall we go?', 'When shall we eat?', 'Why not?', 'How was your day?', "What's on tonight?"]) { // open questions, one per wh-word
      expect(questionKind(q)).toBe('open'); // classified
      expect(texts(q)).toEqual(FOUR); // four defaults, best first
    } // end of the questions
  }); // end of the case

  it('treats a text without a "?" as open too, after the "or not", " or " and wh-word rules', () => { // a sentence, not a question
    for (const q of ['Tell me about your day.', 'Tell me about your day', 'Sam, tell me about your day.']) { // with and without a full stop, and after a name
      expect(questionKind(q)).toBe('open'); // classified
      expect(texts(q)).toEqual(FOUR); // the same four defaults, without Yes or No
    } // end of the texts
    expect(['Tea?', 'Ready? Tell me when.', 'Tea or coffee.', 'Tea or not.'].map(questionKind)).toEqual(['yesno', 'yesno', 'choice', 'yesno']); // a "?" anywhere keeps yes/no; "or" and "or not" still come first
  }); // end of the case
}); // end of defaults that fit the question

describe('optionCandidates', () => { // ask_question with options
  it('returns exactly the options, in their order, then Not now and Not sure, with priors that sum to 1', () => { // no model call
    const c = optionCandidates(['Tea', 'Coffee']); // two options
    expect(c.map((x) => [x.text, x.source])).toEqual([['Tea', 'option'], ['Coffee', 'option'], ['Not now', 'default'], ['Not sure', 'default']]); // four candidates
    expect(c[0]!.prior).toBeCloseTo(c[1]!.prior, 12); // the options are equally likely
    expect(c.reduce((s, x) => s + x.prior, 0)).toBeCloseTo(1, 12); // a distribution
  }); // end of the case

  it('keeps six options and both defaults, and drops a repeated option or default', () => { // limits and duplicates
    expect(optionCandidates(['A', 'B', 'C', 'D', 'E', 'F'])).toHaveLength(8); // a full grid
    expect(optionCandidates(['Tea', 'tea', 'Not now']).map((x) => x.text)).toEqual(['Tea', 'Not now', 'Not sure']); // case-insensitive
  }); // end of the case
}); // end of optionCandidates
