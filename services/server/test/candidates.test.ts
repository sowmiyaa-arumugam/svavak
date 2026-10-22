// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Reply pipeline post-processing: validation, trimming, length cap, de-duplication, merge and priors.

import { describe, expect, it } from 'vitest'; // test API
import { BANNED_TERMS, cleanDrafts, DEFAULT_REPLIES, defaultCandidates, defaultsFor, dropBanned, optionCandidates, questionKind, toCandidates } from '../src/domain/candidates.ts'; // tested
import { REPLY_COUNT, type Intent } from '../src/domain/model.ts'; // eight per question, and the intents

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

  it('drops a closing full stop, keeping "?" and "!", before de-duplicating', () => { // consistent punctuation on the cards
    const raw = { candidates: [ // as the live model wrote them, and worse
      { text: "I don't know yet.", intent: 'clarify', score: 0.5 }, // one full stop
      { text: 'Cricket game, maybe.', intent: 'choice', score: 0.4 }, // a comma inside stays
      { text: 'Really?', intent: 'social', score: 0.3 }, // a question mark stays
      { text: 'Great!', intent: 'social', score: 0.2 }, // so does an exclamation mark
      { text: 'Maybe ...', intent: 'clarify', score: 0.1 }, // several, after a space
      { text: 'Hmm . . .', intent: 'clarify', score: 0.09 }, // spaced out
      { text: 'Let me think…', intent: 'clarify', score: 0.08 }, // an ellipsis character
      { text: '.', intent: 'no', score: 0.05 }, // nothing left
      { text: '. .', intent: 'no', score: 0.05 }, // nothing left either
      { text: 'not sure', intent: 'clarify', score: 0.04 }, // the better of a pair
      { text: 'Not sure.', intent: 'clarify', score: 0.03 }, // the same reply once its full stop is gone
    ] }; // end of the list
    expect(cleanDrafts(raw).map((d) => d.text)).toEqual(["I don't know yet", 'Cricket game, maybe', 'Really?', 'Great!', 'Maybe', 'Hmm', 'Let me think', 'not sure']); // no card ends in a full stop
  }); // end of the case

  it('sorts by score and de-duplicates case-insensitively, keeping the best score', () => { // ranking
    const raw = { candidates: [{ text: 'not now', intent: 'later', score: 0.1 }, { text: 'Yes', intent: 'yes', score: 0.5 }, { text: 'Not Now', intent: 'later', score: 0.3 }] }; // a duplicate
    expect(cleanDrafts(raw)).toEqual([{ text: 'Yes', intent: 'yes', score: 0.5 }, { text: 'Not Now', intent: 'later', score: 0.3 }]); // best of each
  }); // end of the case
}); // end of cleanDrafts

describe('dropBanned', () => { // no profanity
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
  it('returns the eight defaults, Yes and No first, when the model gave nothing', () => { // basic answers at once
    const c = defaultCandidates('Shall I open the window?'); // no model output, for a yes/no question
    expect(c).toHaveLength(REPLY_COUNT); // a full grid
    expect(c.slice(0, 4).map((x) => x.text)).toEqual(['Yes, please', 'No, thanks', 'Thank you', 'Not now']); // shown at once; Thank you is no fallback
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
    expect(c.map((x) => x.text)).toEqual(['Coffee, please', 'Yes, please', 'No, thanks', 'Thank you', 'Not now', 'Not sure', 'Ask me later', 'Tell me more']); // descending scores, the fallbacks after the rest
    expect(c.reduce((s, x) => s + x.prior, 0)).toBeCloseTo(1, 12); // a distribution
    const total = 0.9 + DEFAULT_REPLIES.slice(0, 7).reduce((s, d) => s + d.score, 0); // tau = 1 and every score above the floor
    expect(c[0]!.prior).toBeCloseTo(0.9 / total, 12); // proportional to the score
  }); // end of the case

  it('replaces the weakest candidate with "Not now" when no candidate has intent later', () => { // a later reply is kept
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

  it('ranks every later or clarify reply after the substantive ones, best guess first within each', () => { // a fallback never leads
    const live = [ // the live K3 run's list for "What would you like to watch tonight?", with the intents a model gives them
      { text: "I don't know yet", intent: 'clarify' as const, score: 0.35 }, // led the grid in the footage
      { text: 'Cricket game, maybe', intent: 'choice' as const, score: 0.3 }, // the answer Sam chose
      { text: 'Nothing thanks', intent: 'no' as const, score: 0.1 }, // substantive
      { text: 'Ask me later', intent: 'later' as const, score: 0.09 }, // a fallback
      { text: 'Sure, whatever you pick', intent: 'choice' as const, score: 0.08 }, // substantive
      { text: 'Not sure right now', intent: 'clarify' as const, score: 0.08 }, // a fallback
    ]; // end of the list
    const c = toCandidates(live, defaultsFor('What would you like to watch tonight?')); // filled up with You decide and Tell me more
    expect(c.map((x) => x.text)).toEqual(['Cricket game, maybe', 'Nothing thanks', 'You decide', 'Sure, whatever you pick', "I don't know yet", 'Ask me later', 'Not sure right now', 'Tell me more']); // fallbacks last
    expect(c.reduce((s, x) => s + x.prior, 0)).toBeCloseTo(1, 12); // priors still from the scores
    expect(c[4]!.prior).toBeGreaterThan(c[0]!.prior); // "I don't know yet" keeps its own prior, it is only scanned later
  }); // end of the case

  it('keeps the score order when later and clarify replies are all there is', () => { // nothing substantive to put first
    const c = toCandidates([{ text: 'Ask me later', intent: 'later', score: 0.2 }, { text: "I don't know yet", intent: 'clarify', score: 0.5 }], []); // no defaults to fill from
    expect(c.map((x) => x.text)).toEqual(["I don't know yet", 'Ask me later']); // best guess first
  }); // end of the case
}); // end of toCandidates

describe('the first four replies cover the basic answers', () => { // Yes and No, or each option, on the grid's first row
  type Row = [text: string, intent: Intent, score: number]; // a compact model draft
  const merged = (question: string, rows: Row[]) => toCandidates(rows.map(([text, intent, score]) => ({ text, intent, score })), defaultsFor(question), 'llm', question); // as suggestReplies merges the model's drafts
  const firstFour = (question: string, rows: Row[]) => merged(question, rows).slice(0, 4).map((c) => c.text); // the first row of the grid
  const FILL: Row[] = [['Ask me later', 'later', 0.2], ['Tell me more', 'clarify', 0.15], ['Let me think', 'clarify', 0.1], ['Not right now', 'later', 0.05]]; // four more fallbacks: the model fills the grid, so no default can, and the first four are the four K3 showed

  // The K3 cases (test-results/k3/eval.md): each question's top four from the live run, in their order, as the model's drafts.
  it('adds a yes when the model gave none (K3 Q1, coffee)', () => { // a yes/no question with no yes
    const k3: Row[] = [['No, I prefer tea', 'no', 0.9], ["I'll have tea instead", 'choice', 0.8], ['Maybe later', 'later', 0.7], ['Not sure about coffee', 'clarify', 0.6], ...FILL]; // no yes anywhere
    expect(firstFour('Would you like a cup of coffee?', k3)).toEqual(['No, I prefer tea', "I'll have tea instead", 'Yes, please', 'Maybe later']); // Yes, please before the fallbacks
  }); // end of the case

  it('adds a no when the model gave none (K3 Q7, walk)', () => { // a yes/no question with no no
    const k3: Row[] = [["Yes, let's walk after lunch", 'yes', 0.9], ["Let's see after lunch", 'later', 0.8], ['Maybe later', 'later', 0.7], ['Not sure about the walk', 'clarify', 0.6], ...FILL]; // no no anywhere
    expect(firstFour('Shall we go for a walk after lunch?', k3)).toEqual(["Yes, let's walk after lunch", 'No, thanks', "Let's see after lunch", 'Maybe later']); // No, thanks before the fallbacks
  }); // end of the case

  it('adds a short reply for an option the model did not name (K3 Q13, tea or coffee)', () => { // a choice question with no coffee
    const k3: Row[] = [['I prefer tea, thanks', 'choice', 0.9], ['Yes, tea please', 'yes', 0.8], ['Maybe later', 'later', 0.7], ['Not sure yet', 'clarify', 0.6]]; // tea only
    expect(firstFour('Would you like tea or coffee?', k3)).toEqual(['I prefer tea, thanks', 'Yes, tea please', 'Coffee, please', 'You decide']); // Coffee, please joins tea; the fallbacks follow the substantive replies
  }); // end of the case

  it('does not count a no that names an option (K3 Q14, film or news)', () => { // "No, not the news" turns the news down
    const k3: Row[] = [['I want to watch a film', 'choice', 0.9], ["Yes, let's watch a film", 'yes', 0.8], ['Not sure, maybe later', 'later', 0.7], ['No, not the news', 'no', 0.6]]; // the news only turned down
    expect(firstFour('Shall we watch a film or the news?', k3)).toEqual(['I want to watch a film', "Yes, let's watch a film", 'No, not the news', 'The news, please']); // the news can be chosen
  }); // end of the case

  it('leaves the first four as they are when they cover the basic answers already (K3 Q2, window)', () => { // nothing to do
    const k3: Row[] = [['Yes, please open it', 'yes', 0.9], ['No, keep it closed', 'no', 0.8], ['Maybe later', 'later', 0.7], ['Not sure, ask again', 'clarify', 0.6], ...FILL]; // yes and no first
    expect(merged('Shall I open the window?', k3).map((c) => c.text)).toEqual(k3.map(([text]) => text)); // the model's eight, as they were
  }); // end of the case

  it('moves a basic answer up from further down, and the reply it displaces down one place', () => { // the model gave it, ranked low
    const rows: Row[] = [['Yes, please', 'yes', 0.9], ['A cup of tea', 'choice', 0.8], ['Some water', 'choice', 0.7], ['A biscuit', 'choice', 0.6], ['Some juice', 'choice', 0.5], ['No, thanks', 'no', 0.4], ['Ask me later', 'later', 0.3], ['Not sure', 'clarify', 0.2]]; // the no sixth
    const c = merged('Would you like something?', rows); // merged
    expect(c.map((x) => x.text)).toEqual(['Yes, please', 'A cup of tea', 'Some water', 'No, thanks', 'A biscuit', 'Some juice', 'Ask me later', 'Not sure']); // the lowest-ranked of the first four went down one place
    expect(c.reduce((s, x) => s + x.prior, 0)).toBeCloseTo(1, 12); // priors still a distribution
    expect(c[3]!.prior).toBeLessThan(c[4]!.prior); // and still from the scores: the no keeps its own
  }); // end of the case

  it('never lets the reply that makes room for a later one be a basic answer', () => { // the later rule spares them
    const rows: Row[] = Array.from({ length: 8 }, (_, i) => [`Tea number ${i}`, 'choice', 0.9 - i / 20]); // eight about tea, none later, all above the defaults
    const c = merged('Tea or coffee?', rows); // merged
    expect(c.slice(0, 4).map((x) => x.text)).toEqual(['Tea number 0', 'Tea number 1', 'Tea number 2', 'Coffee, please']); // coffee among the first four
    expect(c.map((x) => x.text)).toContain('Not now'); // and Sam can still say later
    expect(c).toHaveLength(REPLY_COUNT); // eight in all
  }); // end of the case

  it('adds nothing for a choice question without a word before " or ", or without a space before it', () => { // no option to name
    expect(firstFour('Or tea?', [])).toEqual(['You decide', 'Not sure', 'Tell me more', 'Not now']); // the four defaults alone
    expect(firstFour('Tea,or coffee?', [])).toEqual(['You decide', 'Not sure', 'Tell me more', 'Not now']); // a choice ("or coffee?" after the leading word), but no " or " to split at
  }); // end of the case

  it('does not count a reply that turns an option down in its words', () => { // "not", "no", "instead of", "rather than"
    for (const text of ['Tea, not coffee', 'Tea instead of coffee', 'Tea rather than the coffee', 'No coffee, tea']) { // choice replies that rule coffee out
      expect(firstFour('Would you like tea or coffee?', [[text, 'choice', 0.9]])).toContain('Coffee, please'); // coffee can still be chosen
    } // end of the replies
    expect(firstFour('Would you like tea or coffee?', [['A cup of coffee', 'choice', 0.9]])).not.toContain('Coffee, please'); // "of" alone turns nothing down
  }); // end of the case

  it('counts a reply that says the default already, whatever its intent, so no card is shown twice', () => { // a mislabelled reply
    const c = merged('Would you like a blanket?', [['Yes, please', 'social', 0.5], ['No', 'no', 0.4]]); // the model's Yes, please is not marked yes
    expect(c.map((x) => x.text).filter((t) => t === 'Yes, please')).toHaveLength(1); // once
    expect(c.slice(0, 4).map((x) => x.text)).toContain('Yes, please'); // and among the first four
  }); // end of the case

  it('adds nothing for an open question', () => { // no basic answers to cover
    expect(firstFour('What would you like to watch tonight?', [['The cricket', 'choice', 0.9]])).toEqual(['The cricket', 'You decide', 'Not sure', 'Tell me more']); // as before
  }); // end of the case

  it('skips a side of " or " whose word is a function word, and keeps the other', () => { // "are" and "something" name no option
    expect(firstFour('Would you like more or are you full?', [])).toEqual(['More, please', 'You decide', 'Not sure', 'Tell me more']); // never "Are, please"
    expect(firstFour('Cricket or something else?', [])).toEqual(['Cricket, please', 'You decide', 'Not sure', 'Tell me more']); // never "Something, please"
    const sides: [string, string[]][] = [ // a choice question and the options it names, one kind of function word each
      ['Is it you or me?', []], // pronouns on both sides: no option
      ['Tea or is that too strong?', ['Tea, please']], // an auxiliary verb
      ["Tea or don't you fancy any?", ['Tea, please']], // an auxiliary verb's short form with "not"
      ['Tea or would you rather have coffee?', ['Tea, please']], // a modal verb
      ['Tea or not yet?', ['Tea, please']], // "not", where "or not" does not end the question
      ['Coffee or what?', ['Coffee, please']], // a question word
      ['Tea or anything?', ['Tea, please']], // "anything"
      ['Tea or nothing?', ['Tea, please']], // "nothing"
      ['Something else or tea?', ['Tea, please']], // "else", the word before " or "
      ['Something or tea?', ['Tea, please']], // a function word with the question's capital
      ["Tea, or I'll make you coffee?", ['Tea, please']], // "I", always a capital, in a short form
      ['Shall we go in April or May?', ['April, please', 'May, please']], // a capital mid-question marks a name, not the modal verb
      ['Shall we call Sam or Will?', ['Sam, please', 'Will, please']], // likewise
      ['A trip to the UK or the US?', ['The UK, please', 'The US, please']], // and not the pronoun
    ]; // end of the sides
    for (const [q, options] of sides) expect(merged(q, []).map((c) => c.text).filter((t) => t.endsWith(', please'))).toEqual(options); // the option defaults, in the whole list
  }); // end of the case
}); // end of the first four

describe('defaults that fit the question', () => { // Yes, No and Not now only for yes/no questions
  const texts = (question: string) => defaultCandidates(question).map((c) => c.text); // the defaults pushed at once
  const intents = (question: string) => defaultCandidates(question).map((c) => c.intent); // and their intents

  const EIGHT = ['Yes, please', 'No, thanks', 'Thank you', 'Not now', 'Not sure', 'Ask me later', 'Tell me more', 'Maybe']; // the defaults of a yes/no question, as shown: the fallbacks after Thank you

  it('offers Yes and No first for a yes/no question: anything that is neither a choice nor open', () => { // yes/no
    for (const q of ['Shall I open the window?', 'Do you want the radio on?', 'Is it too warm in here?', 'Can I get you anything?', 'Would you like a blanket?', "Don't you want lunch?", 'Tea?', 'Whatever next?']) { // yes/no questions, with no auxiliary verb in the last two
      expect(questionKind(q)).toBe('yesno'); // classified
      expect(texts(q)).toEqual(EIGHT); // all eight defaults, Yes and No first
    } // end of the questions
  }); // end of the case

  it('treats "... or not?" as yes/no, not as a choice', () => { // a yes/no question in disguise
    for (const q of ['Would you like tea or not?', 'Tea or not?', 'Shall we go out, or not ?', 'Now, or not?']) expect(questionKind(q)).toBe('yesno'); // or not, at the end
  }); // end of the case

  it('ignores a leading name and comma', () => { // "Sam, ..." asks the same question
    expect(['Sam, would you like a blanket?', 'Sam, tea or coffee?', 'Sam, what shall we watch?', 'Sam, tea or not?'].map(questionKind)).toEqual(['yesno', 'choice', 'open', 'yesno']); // as without the name
  }); // end of the case

  const FOUR = ['You decide', 'Not sure', 'Tell me more', 'Not now']; // the defaults of a choice or open question, as shown: You decide before the fallbacks

  it('offers each option, then the four defaults, without Yes or No, for a choice question: one with " or "', () => { // choice
    const tea = ['Tea, please', 'Coffee, please']; // the options of "tea or coffee"
    for (const [q, options] of [['Would you like tea or coffee?', tea], ['Tea or coffee?', tea], ['Shall we watch a film or the news?', ['A film, please', 'The news, please']], ['What would you like, tea or coffee?', tea], ['Now, or later?', ['Now, please', 'Later, please']], ['Tea, or coffee?', tea]] as const) { // choice questions: one starting with a wh-word, two with a comma before " or "
      expect(questionKind(q)).toBe('choice'); // classified
      expect(texts(q)).toEqual([...options, ...FOUR]); // the options, then You decide, Not sure, Tell me more, Not now
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

  it("drops an option's closing full stop, as for the model's replies, and no default ends in one", () => { // consistent punctuation on the cards
    expect(optionCandidates(['Tea.', 'Coffee!']).map((x) => x.text)).toEqual(['Tea', 'Coffee!', 'Not now', 'Not sure']); // "!" stays
    for (const q of ['Tea?', 'Tea or coffee?', 'What shall we watch?']) expect(defaultCandidates(q).filter((c) => c.text.endsWith('.'))).toEqual([]); // every default of every kind
  }); // end of the case
}); // end of optionCandidates
