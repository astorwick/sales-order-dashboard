// Star Wars Trivia Game (Hard) - Frontend JavaScript

const SW_TRIVIA_QUESTIONS = [
  // Original Trilogy Deep Cuts
  {
    category: 'Original Trilogy',
    question: 'What is the designation of the trash compactor that nearly kills Luke, Han, Leia, and Chewbacca on the Death Star?',
    choices: ['3263827', '1138', '2187', '327'],
    correctIndex: 0,
    explanation: 'The trash compactor is designated 3263827, located on detention level five.'
  },
  {
    category: 'Original Trilogy',
    question: 'What is the name of the bounty hunter who uses a droid named IG-88 to track the Millennium Falcon?',
    choices: ['Dengar', 'Bossk', '4-LOM', 'None — IG-88 works independently'],
    correctIndex: 3,
    explanation: 'IG-88 is an independent assassin droid bounty hunter, not partnered with another hunter.'
  },
  {
    category: 'Original Trilogy',
    question: 'What type of creature does Luke ride on the ice planet Hoth?',
    choices: ['Bantha', 'Tauntaun', 'Dewback', 'Varactyl'],
    correctIndex: 1,
    explanation: 'Luke rides a tauntaun while patrolling the perimeter of Echo Base on Hoth.'
  },
  {
    category: 'Original Trilogy',
    question: 'What is Admiral Ackbar\'s species?',
    choices: ['Quarren', 'Mon Calamari', 'Sullustan', 'Ishi Tib'],
    correctIndex: 1,
    explanation: 'Admiral Ackbar is a Mon Calamari, from the planet Mon Cala (also called Dac).'
  },
  {
    category: 'Original Trilogy',
    question: 'Who is the first character to speak in the original 1977 Star Wars film?',
    choices: ['Princess Leia', 'Darth Vader', 'C-3PO', 'A Rebel soldier'],
    correctIndex: 2,
    explanation: 'C-3PO speaks first, saying "Did you hear that?" to R2-D2 aboard the Tantive IV.'
  },
  {
    category: 'Original Trilogy',
    question: 'What cell block is Princess Leia held in on the Death Star?',
    choices: ['Cell block AA-23', 'Cell block 1138', 'Cell block 2187', 'Cell block TK-421'],
    correctIndex: 0,
    explanation: 'Leia is held in cell 2187 of cell block AA-23, detention level five.'
  },
  {
    category: 'Original Trilogy',
    question: 'What is the name of Lando Calrissian\'s co-pilot during the Battle of Endor?',
    choices: ['Wedge Antilles', 'Nien Nunb', 'Ten Numb', 'Arvel Crynyd'],
    correctIndex: 1,
    explanation: 'Nien Nunb, a Sullustan, co-pilots the Millennium Falcon with Lando at Endor.'
  },
  {
    category: 'Original Trilogy',
    question: 'What planet does Yoda exile himself to?',
    choices: ['Yavin IV', 'Dagobah', 'Kashyyyk', 'Mustafar'],
    correctIndex: 1,
    explanation: 'Yoda lives in exile on the swamp planet Dagobah after the fall of the Republic.'
  },

  // Prequel Trilogy
  {
    category: 'Prequel Trilogy',
    question: 'What is the name of the Geonosian leader who oversees the droid foundries?',
    choices: ['Wat Tambor', 'Poggle the Lesser', 'San Hill', 'Shu Mai'],
    correctIndex: 1,
    explanation: 'Poggle the Lesser is the Archduke of Geonosis who controls the battle droid factories.'
  },
  {
    category: 'Prequel Trilogy',
    question: 'What midi-chlorian count does Qui-Gon report for young Anakin Skywalker?',
    choices: ['Over 10,000', 'Over 15,000', 'Over 20,000', 'Over 27,000'],
    correctIndex: 2,
    explanation: 'Qui-Gon reports Anakin\'s count as "over 20,000," higher than Master Yoda\'s.'
  },
  {
    category: 'Prequel Trilogy',
    question: 'What is the name of Jango Fett\'s ship?',
    choices: ['Firespray', 'Slave I', 'Razor Crest', 'Hound\'s Tooth'],
    correctIndex: 1,
    explanation: 'Jango Fett flies Slave I, which is later inherited by his clone son Boba Fett.'
  },
  {
    category: 'Prequel Trilogy',
    question: 'Which Jedi Master sits on the Council but is killed during Order 66 on Mygeeto?',
    choices: ['Agen Kolar', 'Saesee Tiin', 'Ki-Adi-Mundi', 'Stass Allie'],
    correctIndex: 2,
    explanation: 'Ki-Adi-Mundi is gunned down by clone troopers on the bridge of Mygeeto during Order 66.'
  },
  {
    category: 'Prequel Trilogy',
    question: 'What is the name of the planet where the clone army is created?',
    choices: ['Geonosis', 'Kamino', 'Mustafar', 'Utapau'],
    correctIndex: 1,
    explanation: 'The clone army is grown and trained on the ocean world of Kamino.'
  },
  {
    category: 'Prequel Trilogy',
    question: 'What form of lightsaber combat does Count Dooku specialize in?',
    choices: ['Form I — Shii-Cho', 'Form II — Makashi', 'Form IV — Ataru', 'Form VII — Juyo'],
    correctIndex: 1,
    explanation: 'Dooku is a master of Form II (Makashi), a style focused on elegant lightsaber-to-lightsaber combat.'
  },
  {
    category: 'Prequel Trilogy',
    question: 'What is Chancellor Palpatine\'s Sith title?',
    choices: ['Darth Plagueis', 'Darth Sidious', 'Darth Tyranus', 'Darth Bane'],
    correctIndex: 1,
    explanation: 'Palpatine is Darth Sidious. Darth Tyranus is Count Dooku, and Darth Plagueis was Sidious\'s master.'
  },
  {
    category: 'Prequel Trilogy',
    question: 'How many Jedi does Palpatine kill in his office before Mace Windu disarms him?',
    choices: ['1', '2', '3', '4'],
    correctIndex: 2,
    explanation: 'Palpatine kills Agen Kolar, Saesee Tiin, and Kit Fisto before Windu overpowers him.'
  },

  // Sequel Trilogy
  {
    category: 'Sequel Trilogy',
    question: 'What is Finn\'s stormtrooper designation?',
    choices: ['FN-2187', 'FN-2199', 'TK-421', 'FN-1824'],
    correctIndex: 0,
    explanation: 'Finn\'s designation is FN-2187, a nod to Princess Leia\'s cell number on the Death Star.'
  },
  {
    category: 'Sequel Trilogy',
    question: 'What is the name of Kylo Ren\'s personal shuttle?',
    choices: ['Upsilon-class command shuttle', 'Lambda-class shuttle', 'Xi-class shuttle', 'Sentinel-class shuttle'],
    correctIndex: 0,
    explanation: 'Kylo Ren flies an Upsilon-class command shuttle with its distinctive folding wings.'
  },
  {
    category: 'Sequel Trilogy',
    question: 'What is the name of the planet that houses Starkiller Base?',
    choices: ['Ilum', 'Exegol', 'Moraband', 'Rakata Prime'],
    correctIndex: 0,
    explanation: 'Starkiller Base is built into the planet Ilum, which was formerly a Jedi kyber crystal source.'
  },
  {
    category: 'Sequel Trilogy',
    question: 'What is the name of the Resistance base planet in The Last Jedi?',
    choices: ['D\'Qar', 'Crait', 'Ajan Kloss', 'Batuu'],
    correctIndex: 1,
    explanation: 'The climactic battle of The Last Jedi takes place on Crait, a mineral planet with a salt surface over red crystal.'
  },

  // Expanded Universe / Deep Lore
  {
    category: 'Deep Lore',
    question: 'What is the Rule of Two, and who established it?',
    choices: ['Two Jedi per Padawan — Yoda', 'Two Sith at a time — Darth Bane', 'Two sabers per Jedi — Kreia', 'Two temples per system — Revan'],
    correctIndex: 1,
    explanation: 'Darth Bane established the Rule of Two: one Sith master and one apprentice, no more.'
  },
  {
    category: 'Deep Lore',
    question: 'What kyber crystal color is associated with a Jedi who has purified a Sith\'s red crystal?',
    choices: ['Silver', 'Gold', 'White', 'Black'],
    correctIndex: 2,
    explanation: 'A purified red kyber crystal turns white, as shown by Ahsoka Tano\'s lightsabers.'
  },
  {
    category: 'Deep Lore',
    question: 'What is the name of the ancient Sith homeworld?',
    choices: ['Dathomir', 'Malachor', 'Korriban', 'Ziost'],
    correctIndex: 2,
    explanation: 'Korriban (also called Moraband) is the ancient Sith homeworld, housing the Valley of the Dark Lords.'
  },
  {
    category: 'Deep Lore',
    question: 'In the Darth Plagueis novel, what species is Darth Plagueis?',
    choices: ['Human', 'Muun', 'Chagrian', 'Pau\'an'],
    correctIndex: 1,
    explanation: 'Darth Plagueis is a Muun, the same species known for running the InterGalactic Banking Clan.'
  },

  // Behind the Scenes
  {
    category: 'Behind the Scenes',
    question: 'What actor was originally cast as Han Solo before Harrison Ford?',
    choices: ['Kurt Russell', 'Christopher Walken', 'Nick Nolte', 'No one — Ford was always first choice'],
    correctIndex: 3,
    explanation: 'This is a trick question. While many actors auditioned, Harrison Ford was hired after reading lines for other actors during casting. No one else was officially cast before him.'
  },
  {
    category: 'Behind the Scenes',
    question: 'What was the original title of Return of the Jedi?',
    choices: ['Revenge of the Jedi', 'Rise of the Jedi', 'Fall of the Empire', 'The Last Battle'],
    correctIndex: 0,
    explanation: 'The film was originally titled "Revenge of the Jedi" but was changed because George Lucas felt revenge was not a Jedi concept.'
  },
  {
    category: 'Behind the Scenes',
    question: 'What real-world language is Huttese primarily based on?',
    choices: ['Finnish', 'Quechua', 'Swahili', 'Navajo'],
    correctIndex: 1,
    explanation: 'Huttese was created by sound designer Ben Burtt and is primarily based on Quechua, an indigenous language of the Andes.'
  },
  {
    category: 'Behind the Scenes',
    question: 'What British actor provided the voice of Darth Vader?',
    choices: ['Peter Cushing', 'James Earl Jones', 'Ian McDiarmid', 'Christopher Lee'],
    correctIndex: 1,
    explanation: 'James Earl Jones voiced Darth Vader, while David Prowse wore the suit on set.'
  },

  // Mandalorian / Series
  {
    category: 'Series',
    question: 'What is the real name of "The Mandalorian" (Din Djarin\'s) foundling?',
    choices: ['Yoda', 'Yaddle', 'Grogu', 'The Child'],
    correctIndex: 2,
    explanation: 'The Child\'s real name is Grogu, revealed by Ahsoka Tano in The Mandalorian Season 2.'
  },
  {
    category: 'Series',
    question: 'What is the Mandalorian creed phrase that means "This is the Way"?',
    choices: ['Oya manda', 'Ke nu\'jurkadir', 'Mhi solus tome', 'Bah\'lor an teh Wey'],
    correctIndex: 0,
    explanation: 'While the English phrase "This is the Way" is most used in the show, "Oya manda" is a Mandalorian rallying cry closely tied to their creed.'
  },
  {
    category: 'Series',
    question: 'What type of beskar weapon does the Armorer forge for Din Djarin from his first earned beskar?',
    choices: ['A helmet', 'A vambrace', 'A pauldron', 'A cuirass'],
    correctIndex: 2,
    explanation: 'The Armorer forges a right pauldron (shoulder armor) from Din Djarin\'s first beskar payment.'
  },
  {
    category: 'Series',
    question: 'In Andor, what is the name of the Imperial prison facility where Cassian is held?',
    choices: ['Wobani', 'Narkina 5', 'Lothal', 'Eadu'],
    correctIndex: 1,
    explanation: 'Cassian Andor is imprisoned at the Narkina 5 Imperial factory prison, where inmates build components for the Death Star.'
  },

  // Ships & Technology
  {
    category: 'Ships & Tech',
    question: 'What is the length of an Imperial Star Destroyer?',
    choices: ['900 meters', '1,200 meters', '1,600 meters', '2,400 meters'],
    correctIndex: 2,
    explanation: 'An Imperial I-class Star Destroyer is 1,600 meters (approximately 1 mile) long.'
  },
  {
    category: 'Ships & Tech',
    question: 'What class of ship is the Millennium Falcon?',
    choices: ['VCX-100 light freighter', 'YT-1300 light freighter', 'HWK-290 light freighter', 'CR90 corvette'],
    correctIndex: 1,
    explanation: 'The Millennium Falcon is a modified Corellian Engineering Corporation YT-1300f light freighter.'
  },
  {
    category: 'Ships & Tech',
    question: 'How many engines does an X-wing starfighter have?',
    choices: ['2', '4', '6', '8'],
    correctIndex: 1,
    explanation: 'An X-wing has 4 fusial thrust engines, one at the tip of each S-foil (wing).'
  },
  {
    category: 'Ships & Tech',
    question: 'What powers a lightsaber?',
    choices: ['Plasma cell', 'Kyber crystal', 'Tibanna gas', 'Coaxium'],
    correctIndex: 1,
    explanation: 'A kyber crystal is the core component of a lightsaber, focusing energy into the blade.'
  }
];

// State
let swTriviaState = {
  correctCount: 0,
  incorrectCount: 0,
  usedIndices: [],
  currentQuestion: null,
  currentQuestionIndex: -1,
  answered: false,
  initialized: false
};

// DOM elements
let swTriviaElements = {};

function cacheSwTriviaElements() {
  swTriviaElements = {
    correct: document.getElementById('sw-trivia-correct'),
    incorrect: document.getElementById('sw-trivia-incorrect'),
    category: document.getElementById('sw-trivia-category'),
    question: document.getElementById('sw-trivia-question'),
    choices: document.getElementById('sw-trivia-choices'),
    feedback: document.getElementById('sw-trivia-feedback'),
    nextBtn: document.getElementById('sw-trivia-next-btn')
  };
}

function pickRandomSwQuestion() {
  if (swTriviaState.usedIndices.length >= SW_TRIVIA_QUESTIONS.length) {
    swTriviaState.usedIndices = [];
  }

  let index;
  do {
    index = Math.floor(Math.random() * SW_TRIVIA_QUESTIONS.length);
  } while (swTriviaState.usedIndices.includes(index));

  swTriviaState.usedIndices.push(index);
  swTriviaState.currentQuestionIndex = index;
  swTriviaState.currentQuestion = SW_TRIVIA_QUESTIONS[index];
  swTriviaState.answered = false;
}

function renderSwQuestion() {
  const q = swTriviaState.currentQuestion;

  swTriviaElements.category.textContent = q.category;
  swTriviaElements.question.textContent = q.question;

  swTriviaElements.choices.innerHTML = q.choices.map((choice, i) =>
    `<button class="trivia-choice-btn" data-index="${i}">${escapeHtml(choice)}</button>`
  ).join('');

  swTriviaElements.choices.querySelectorAll('.trivia-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => handleSwAnswer(parseInt(btn.dataset.index)));
  });

  swTriviaElements.feedback.className = 'trivia-feedback';
  swTriviaElements.feedback.textContent = '';
  swTriviaElements.nextBtn.style.display = 'none';
}

function handleSwAnswer(selectedIndex) {
  if (swTriviaState.answered) return;
  swTriviaState.answered = true;

  const q = swTriviaState.currentQuestion;
  const isCorrect = selectedIndex === q.correctIndex;
  const buttons = swTriviaElements.choices.querySelectorAll('.trivia-choice-btn');

  buttons.forEach(btn => btn.disabled = true);

  if (isCorrect) {
    buttons[selectedIndex].classList.add('selected-correct');
    swTriviaState.correctCount++;
    swTriviaElements.feedback.className = 'trivia-feedback correct';
    swTriviaElements.feedback.textContent = 'Correct! ' + q.explanation;
  } else {
    buttons[selectedIndex].classList.add('selected-wrong');
    buttons[q.correctIndex].classList.add('reveal-correct');
    swTriviaState.incorrectCount++;
    swTriviaElements.feedback.className = 'trivia-feedback incorrect';
    swTriviaElements.feedback.textContent = 'Wrong! ' + q.explanation;
  }

  swTriviaElements.correct.textContent = swTriviaState.correctCount;
  swTriviaElements.incorrect.textContent = swTriviaState.incorrectCount;
  swTriviaElements.nextBtn.style.display = 'inline-block';
}

function nextSwQuestion() {
  pickRandomSwQuestion();
  renderSwQuestion();
}

function initSwTrivia() {
  if (swTriviaState.initialized) return;
  swTriviaState.initialized = true;

  cacheSwTriviaElements();
  swTriviaElements.nextBtn.addEventListener('click', nextSwQuestion);

  pickRandomSwQuestion();
  renderSwQuestion();
}
