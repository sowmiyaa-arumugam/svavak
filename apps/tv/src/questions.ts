// Copyright 2026 Sowmiya Arumugam
// SPDX-License-Identifier: Apache-2.0
// Mock questions and replies for the conversation screen: a synthetic persona, no real personal data.

/** A question with its eight reply candidates, best guess first, in grid order (two rows of four). */
export interface Question { // one fixture entry
  speaker: string; // who asks, shown as "<speaker> asks"
  text: string; // the question
  replies: readonly string[]; // eight replies
} // end of Question

/** Shown in order; after the last question the first comes again. */
export const QUESTIONS: readonly Question[] = [ // five questions, eight replies each
  { // question 1 (the example of plan Figure 4)
    speaker: 'Alex', // the partner in the room
    text: 'Would you like tea or coffee?', // the question
    replies: [ // two rows of four
      'Coffee, please', 'Tea, please', 'Coffee with milk', 'Just water', // first row
      'Not right now', 'Yes, please', 'No, thanks', 'Ask me later', // second row
    ], // end of replies
  }, // end of question 1
  { // question 2
    speaker: 'Alex', // the partner in the room
    text: 'Shall we watch something tonight?', // the question
    replies: [ // two rows of four
      'Yes, a film', 'The news', 'A quiz show', 'Something funny', // first row
      'Not tonight', 'You choose', 'Music instead', 'Ask me later', // second row
    ], // end of replies
  }, // end of question 2
  { // question 3
    speaker: 'Alex', // the partner in the room
    text: 'How are you feeling today?', // the question
    replies: [ // two rows of four
      'Good, thanks', 'A bit tired', 'In some pain', 'Happy', // first row
      'Bored', 'Cold', 'Too warm', "I'd rather not say", // second row
    ], // end of replies
  }, // end of question 3
  { // question 4
    speaker: 'Alex', // the partner in the room
    text: 'What would you like for lunch?', // the question
    replies: [ // two rows of four
      'Soup', 'A sandwich', 'Pasta', 'Something light', // first row
      'Not hungry yet', 'Surprise me', 'Same as yesterday', 'Ask me later', // second row
    ], // end of replies
  }, // end of question 4
  { // question 5
    speaker: 'Alex', // the partner in the room
    text: 'Shall I open the window?', // the question
    replies: [ // two rows of four
      'Yes, please', 'No, thanks', 'Just a little', 'Close the curtains', // first row
      'Warmer, please', 'Cooler, please', 'Leave it', 'Ask me later', // second row
    ], // end of replies
  }, // end of question 5
]; // end of QUESTIONS
