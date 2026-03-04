// Trivia Game - Frontend JavaScript

const TRIVIA_QUESTIONS = [
  // Sports
  {
    category: 'Sports',
    question: 'How many players are on a standard basketball team on the court at one time?',
    choices: ['4', '5', '6', '7'],
    correctIndex: 1,
    explanation: 'A basketball team has 5 players on the court at a time.'
  },
  {
    category: 'Sports',
    question: 'Which country won the first FIFA World Cup in 1930?',
    choices: ['Brazil', 'Argentina', 'Uruguay', 'Italy'],
    correctIndex: 2,
    explanation: 'Uruguay won the first World Cup, which was also hosted in Uruguay.'
  },
  {
    category: 'Sports',
    question: 'In tennis, what is a score of zero called?',
    choices: ['Nil', 'Love', 'Nought', 'Blank'],
    correctIndex: 1,
    explanation: 'In tennis, a score of zero is called "love."'
  },
  {
    category: 'Sports',
    question: 'How many holes are played in a standard round of golf?',
    choices: ['9', '12', '16', '18'],
    correctIndex: 3,
    explanation: 'A standard round of golf consists of 18 holes.'
  },
  {
    category: 'Sports',
    question: 'Which sport uses a shuttlecock?',
    choices: ['Tennis', 'Badminton', 'Squash', 'Table Tennis'],
    correctIndex: 1,
    explanation: 'Badminton uses a shuttlecock (also called a birdie).'
  },
  {
    category: 'Sports',
    question: 'What is the diameter of a basketball hoop in inches?',
    choices: ['16 inches', '18 inches', '20 inches', '22 inches'],
    correctIndex: 1,
    explanation: 'A regulation basketball hoop is 18 inches in diameter.'
  },
  {
    category: 'Sports',
    question: 'Which NFL team has won the most Super Bowls?',
    choices: ['Dallas Cowboys', 'San Francisco 49ers', 'New England Patriots', 'Pittsburgh Steelers'],
    correctIndex: 2,
    explanation: 'The New England Patriots and Pittsburgh Steelers are tied with 6 Super Bowl wins each, but the Patriots have the most recent wins.'
  },
  {
    category: 'Sports',
    question: 'What sport is played at Wimbledon?',
    choices: ['Cricket', 'Golf', 'Tennis', 'Rugby'],
    correctIndex: 2,
    explanation: 'Wimbledon is the oldest and most prestigious tennis tournament in the world.'
  },

  // Movies
  {
    category: 'Movies',
    question: 'What year was the original Star Wars film released?',
    choices: ['1975', '1977', '1979', '1980'],
    correctIndex: 1,
    explanation: 'Star Wars (later subtitled A New Hope) was released in 1977.'
  },
  {
    category: 'Movies',
    question: 'Who directed Jurassic Park?',
    choices: ['James Cameron', 'Steven Spielberg', 'Ridley Scott', 'George Lucas'],
    correctIndex: 1,
    explanation: 'Steven Spielberg directed Jurassic Park, released in 1993.'
  },
  {
    category: 'Movies',
    question: 'What is the highest-grossing film of all time (not adjusted for inflation)?',
    choices: ['Avengers: Endgame', 'Avatar', 'Titanic', 'Star Wars: The Force Awakens'],
    correctIndex: 1,
    explanation: 'Avatar (2009) is the highest-grossing film of all time worldwide.'
  },
  {
    category: 'Movies',
    question: 'In The Wizard of Oz, what color are Dorothy\'s slippers?',
    choices: ['Silver', 'Gold', 'Ruby Red', 'Blue'],
    correctIndex: 2,
    explanation: 'Dorothy\'s slippers are ruby red in the 1939 film.'
  },
  {
    category: 'Movies',
    question: 'Which actor played Jack Dawson in Titanic?',
    choices: ['Brad Pitt', 'Matt Damon', 'Leonardo DiCaprio', 'Johnny Depp'],
    correctIndex: 2,
    explanation: 'Leonardo DiCaprio played Jack Dawson in the 1997 film Titanic.'
  },
  {
    category: 'Movies',
    question: 'What is the name of the fictional country in Black Panther?',
    choices: ['Zamunda', 'Wakanda', 'Genovia', 'Latveria'],
    correctIndex: 1,
    explanation: 'Wakanda is the fictional African nation in Black Panther.'
  },
  {
    category: 'Movies',
    question: 'Who played the Joker in The Dark Knight?',
    choices: ['Jack Nicholson', 'Jared Leto', 'Joaquin Phoenix', 'Heath Ledger'],
    correctIndex: 3,
    explanation: 'Heath Ledger played the Joker in The Dark Knight (2008), earning a posthumous Academy Award.'
  },
  {
    category: 'Movies',
    question: 'What animated film features a clownfish searching for his son?',
    choices: ['Shark Tale', 'Finding Nemo', 'The Little Mermaid', 'Moana'],
    correctIndex: 1,
    explanation: 'Finding Nemo (2003) follows Marlin the clownfish searching for his son Nemo.'
  },

  // Music
  {
    category: 'Music',
    question: 'Which band released the album "Abbey Road"?',
    choices: ['The Rolling Stones', 'The Who', 'The Beatles', 'Led Zeppelin'],
    correctIndex: 2,
    explanation: 'Abbey Road was released by The Beatles in 1969.'
  },
  {
    category: 'Music',
    question: 'What instrument does a pianist play?',
    choices: ['Organ', 'Harpsichord', 'Piano', 'Synthesizer'],
    correctIndex: 2,
    explanation: 'A pianist plays the piano!'
  },
  {
    category: 'Music',
    question: 'Which artist is known as the "King of Pop"?',
    choices: ['Elvis Presley', 'Prince', 'Michael Jackson', 'Stevie Wonder'],
    correctIndex: 2,
    explanation: 'Michael Jackson earned the title "King of Pop."'
  },
  {
    category: 'Music',
    question: 'How many strings does a standard guitar have?',
    choices: ['4', '5', '6', '8'],
    correctIndex: 2,
    explanation: 'A standard guitar has 6 strings.'
  },
  {
    category: 'Music',
    question: 'Which musical features the song "Defying Gravity"?',
    choices: ['Hamilton', 'Wicked', 'Phantom of the Opera', 'Les Miserables'],
    correctIndex: 1,
    explanation: '"Defying Gravity" is from the musical Wicked.'
  },
  {
    category: 'Music',
    question: 'What genre of music originated in New Orleans in the early 20th century?',
    choices: ['Blues', 'Jazz', 'Rock and Roll', 'Country'],
    correctIndex: 1,
    explanation: 'Jazz originated in New Orleans in the early 1900s.'
  },
  {
    category: 'Music',
    question: 'Which artist released the album "1989"?',
    choices: ['Adele', 'Beyonce', 'Taylor Swift', 'Rihanna'],
    correctIndex: 2,
    explanation: 'Taylor Swift released the album 1989 in 2014.'
  },
  {
    category: 'Music',
    question: 'What is the highest-pitched instrument in a standard string quartet?',
    choices: ['Viola', 'Cello', 'Violin', 'Double Bass'],
    correctIndex: 2,
    explanation: 'The violin is the highest-pitched instrument in a string quartet.'
  },

  // Math
  {
    category: 'Math',
    question: 'What is the square root of 144?',
    choices: ['10', '11', '12', '14'],
    correctIndex: 2,
    explanation: '12 x 12 = 144.'
  },
  {
    category: 'Math',
    question: 'What is the value of Pi rounded to two decimal places?',
    choices: ['3.12', '3.14', '3.16', '3.18'],
    correctIndex: 1,
    explanation: 'Pi rounded to two decimal places is 3.14.'
  },
  {
    category: 'Math',
    question: 'How many sides does a hexagon have?',
    choices: ['5', '6', '7', '8'],
    correctIndex: 1,
    explanation: 'A hexagon has 6 sides.'
  },
  {
    category: 'Math',
    question: 'What is 15% of 200?',
    choices: ['25', '30', '35', '40'],
    correctIndex: 1,
    explanation: '15% of 200 = 0.15 x 200 = 30.'
  },
  {
    category: 'Math',
    question: 'What is the next prime number after 7?',
    choices: ['8', '9', '10', '11'],
    correctIndex: 3,
    explanation: '11 is the next prime number after 7 (8, 9, and 10 are all composite).'
  },
  {
    category: 'Math',
    question: 'What does the Roman numeral "C" represent?',
    choices: ['50', '100', '500', '1000'],
    correctIndex: 1,
    explanation: 'The Roman numeral C represents 100.'
  },
  {
    category: 'Math',
    question: 'If a triangle has angles of 90 and 45 degrees, what is the third angle?',
    choices: ['35 degrees', '40 degrees', '45 degrees', '55 degrees'],
    correctIndex: 2,
    explanation: 'A triangle\'s angles sum to 180. So 180 - 90 - 45 = 45 degrees.'
  },
  {
    category: 'Math',
    question: 'What is 7 factorial (7!)?',
    choices: ['720', '2520', '5040', '40320'],
    correctIndex: 2,
    explanation: '7! = 7 x 6 x 5 x 4 x 3 x 2 x 1 = 5040.'
  },

  // History
  {
    category: 'History',
    question: 'In what year did World War II end?',
    choices: ['1943', '1944', '1945', '1946'],
    correctIndex: 2,
    explanation: 'World War II ended in 1945.'
  },
  {
    category: 'History',
    question: 'Who was the first President of the United States?',
    choices: ['Thomas Jefferson', 'John Adams', 'Benjamin Franklin', 'George Washington'],
    correctIndex: 3,
    explanation: 'George Washington was the first President, serving from 1789 to 1797.'
  },
  {
    category: 'History',
    question: 'What ancient wonder was located in Alexandria, Egypt?',
    choices: ['The Colossus', 'The Hanging Gardens', 'The Lighthouse', 'The Great Pyramid'],
    correctIndex: 2,
    explanation: 'The Lighthouse of Alexandria (Pharos) was one of the Seven Wonders of the Ancient World.'
  },
  {
    category: 'History',
    question: 'Which ship sank on its maiden voyage in 1912?',
    choices: ['Lusitania', 'Britannic', 'Titanic', 'Olympic'],
    correctIndex: 2,
    explanation: 'The RMS Titanic sank on April 15, 1912 after hitting an iceberg.'
  },
  {
    category: 'History',
    question: 'What wall divided Berlin from 1961 to 1989?',
    choices: ['The Iron Curtain', 'The Berlin Wall', 'The Great Wall', 'Hadrian\'s Wall'],
    correctIndex: 1,
    explanation: 'The Berlin Wall divided East and West Berlin from 1961 until it fell in 1989.'
  },
  {
    category: 'History',
    question: 'Who was the first person to walk on the moon?',
    choices: ['Buzz Aldrin', 'Yuri Gagarin', 'Neil Armstrong', 'John Glenn'],
    correctIndex: 2,
    explanation: 'Neil Armstrong was the first person to walk on the moon on July 20, 1969.'
  },
  {
    category: 'History',
    question: 'The Renaissance began in which country?',
    choices: ['France', 'England', 'Italy', 'Spain'],
    correctIndex: 2,
    explanation: 'The Renaissance began in Italy in the 14th century.'
  },
  {
    category: 'History',
    question: 'What year did the United States declare independence?',
    choices: ['1774', '1775', '1776', '1778'],
    correctIndex: 2,
    explanation: 'The Declaration of Independence was adopted on July 4, 1776.'
  },
  {
    category: 'History',
    question: 'Which ancient civilization built Machu Picchu?',
    choices: ['Aztec', 'Maya', 'Inca', 'Olmec'],
    correctIndex: 2,
    explanation: 'Machu Picchu was built by the Inca Empire in the 15th century.'
  },
  {
    category: 'History',
    question: 'What was the name of the first artificial satellite launched into space?',
    choices: ['Explorer 1', 'Sputnik 1', 'Vanguard 1', 'Luna 1'],
    correctIndex: 1,
    explanation: 'Sputnik 1 was launched by the Soviet Union on October 4, 1957.'
  },

  // Science
  {
    category: 'Science',
    question: 'What is the chemical symbol for tungsten?',
    choices: ['Tu', 'Tn', 'W', 'Tg'],
    correctIndex: 2,
    explanation: 'Tungsten\'s symbol is W, from its German name "Wolfram."'
  },
  {
    category: 'Science',
    question: 'What is the most abundant gas in Earth\'s atmosphere?',
    choices: ['Oxygen', 'Carbon Dioxide', 'Hydrogen', 'Nitrogen'],
    correctIndex: 3,
    explanation: 'Nitrogen makes up about 78% of Earth\'s atmosphere.'
  },
  {
    category: 'Science',
    question: 'What particle in an atom has no electric charge?',
    choices: ['Proton', 'Electron', 'Neutron', 'Positron'],
    correctIndex: 2,
    explanation: 'Neutrons are electrically neutral particles found in the nucleus.'
  },
  {
    category: 'Science',
    question: 'What is the speed of light in a vacuum, approximately?',
    choices: ['186,000 miles per second', '200,000 miles per second', '150,000 miles per second', '250,000 miles per second'],
    correctIndex: 0,
    explanation: 'Light travels at approximately 186,000 miles per second (300,000 km/s).'
  },
  {
    category: 'Science',
    question: 'Which organ in the human body produces insulin?',
    choices: ['Liver', 'Kidney', 'Pancreas', 'Spleen'],
    correctIndex: 2,
    explanation: 'The pancreas produces insulin to regulate blood sugar levels.'
  },
  {
    category: 'Science',
    question: 'What force keeps planets in orbit around the sun?',
    choices: ['Magnetism', 'Centripetal force', 'Gravity', 'Nuclear force'],
    correctIndex: 2,
    explanation: 'Gravity is the force that keeps planets in orbit around the sun.'
  },

  // Food
  {
    category: 'Food',
    question: 'What Japanese dish consists of vinegared rice topped with raw fish?',
    choices: ['Ramen', 'Tempura', 'Sushi', 'Udon'],
    correctIndex: 2,
    explanation: 'Sushi features vinegared rice, often topped or filled with raw fish.'
  },
  {
    category: 'Food',
    question: 'Which spice is the most expensive by weight?',
    choices: ['Vanilla', 'Saffron', 'Cardamom', 'Cinnamon'],
    correctIndex: 1,
    explanation: 'Saffron is the most expensive spice, harvested by hand from crocus flowers.'
  },
  {
    category: 'Food',
    question: 'What type of pastry is used to make a croissant?',
    choices: ['Choux', 'Puff', 'Laminated', 'Shortcrust'],
    correctIndex: 2,
    explanation: 'Croissants are made from laminated dough — layers of butter folded into yeast dough.'
  },
  {
    category: 'Food',
    question: 'Which country is the origin of the cocktail "Mojito"?',
    choices: ['Mexico', 'Cuba', 'Brazil', 'Puerto Rico'],
    correctIndex: 1,
    explanation: 'The Mojito originated in Cuba, made with rum, lime, sugar, mint, and soda water.'
  },
  {
    category: 'Food',
    question: 'What is the main ingredient in hummus?',
    choices: ['Lentils', 'Black beans', 'Chickpeas', 'Fava beans'],
    correctIndex: 2,
    explanation: 'Hummus is made primarily from mashed chickpeas blended with tahini, lemon, and garlic.'
  },
  {
    category: 'Food',
    question: 'At what temperature (Fahrenheit) does water boil at sea level?',
    choices: ['200°F', '205°F', '210°F', '212°F'],
    correctIndex: 3,
    explanation: 'Water boils at 212°F (100°C) at sea level.'
  },

  // Automobiles
  {
    category: 'Automobiles',
    question: 'Which company manufactures the Mustang?',
    choices: ['Chevrolet', 'Dodge', 'Ford', 'Pontiac'],
    correctIndex: 2,
    explanation: 'The Ford Mustang has been produced by Ford since 1964.'
  },
  {
    category: 'Automobiles',
    question: 'What does "RPM" stand for in an engine?',
    choices: ['Rapid Power Mode', 'Revolutions Per Minute', 'Rotary Power Mechanism', 'Rate of Propulsion Metric'],
    correctIndex: 1,
    explanation: 'RPM stands for Revolutions Per Minute, measuring engine speed.'
  },
  {
    category: 'Automobiles',
    question: 'Which country is home to the car manufacturer Volvo?',
    choices: ['Germany', 'Finland', 'Norway', 'Sweden'],
    correctIndex: 3,
    explanation: 'Volvo was founded in Gothenburg, Sweden in 1927.'
  },
  {
    category: 'Automobiles',
    question: 'What does the "hybrid" in hybrid cars refer to?',
    choices: ['Two fuel tanks', 'Gas engine and electric motor', 'Two transmissions', 'Diesel and gas engines'],
    correctIndex: 1,
    explanation: 'Hybrid vehicles combine a gasoline engine with an electric motor.'
  },
  {
    category: 'Automobiles',
    question: 'Which Italian city is home to Ferrari\'s headquarters?',
    choices: ['Milan', 'Turin', 'Maranello', 'Bologna'],
    correctIndex: 2,
    explanation: 'Ferrari\'s headquarters is in Maranello, in the Emilia-Romagna region of Italy.'
  },
  {
    category: 'Automobiles',
    question: 'What car company uses a "bull" as its logo?',
    choices: ['Ferrari', 'Porsche', 'Lamborghini', 'Maserati'],
    correctIndex: 2,
    explanation: 'Lamborghini\'s logo features a charging bull, reflecting founder Ferruccio Lamborghini\'s zodiac sign, Taurus.'
  },

  // Technology
  {
    category: 'Technology',
    question: 'What does "HTTP" stand for?',
    choices: ['HyperText Transfer Protocol', 'High Tech Transfer Process', 'HyperText Transmission Platform', 'High Transfer Text Protocol'],
    correctIndex: 0,
    explanation: 'HTTP stands for HyperText Transfer Protocol, the foundation of web communication.'
  },
  {
    category: 'Technology',
    question: 'In what year was the first iPhone released?',
    choices: ['2005', '2006', '2007', '2008'],
    correctIndex: 2,
    explanation: 'The first iPhone was released by Apple on June 29, 2007.'
  },
  {
    category: 'Technology',
    question: 'What programming language is known as the "language of the web"?',
    choices: ['Python', 'Java', 'JavaScript', 'C++'],
    correctIndex: 2,
    explanation: 'JavaScript is the primary programming language for web browsers.'
  },
  {
    category: 'Technology',
    question: 'How many bits are in a byte?',
    choices: ['4', '6', '8', '16'],
    correctIndex: 2,
    explanation: 'A byte consists of 8 bits.'
  },
  {
    category: 'Technology',
    question: 'Who co-founded Apple Computer with Steve Jobs?',
    choices: ['Bill Gates', 'Steve Wozniak', 'Paul Allen', 'Tim Cook'],
    correctIndex: 1,
    explanation: 'Steve Wozniak co-founded Apple with Steve Jobs in 1976.'
  },
  {
    category: 'Technology',
    question: 'What does "GPU" stand for?',
    choices: ['General Processing Utility', 'Graphics Performance Unit', 'Graphics Processing Unit', 'General Purpose Unit'],
    correctIndex: 2,
    explanation: 'GPU stands for Graphics Processing Unit, used for rendering images and parallel computing.'
  }
];

// State
let triviaState = {
  correctCount: 0,
  incorrectCount: 0,
  usedIndices: [],
  currentQuestion: null,
  currentQuestionIndex: -1,
  answered: false,
  initialized: false
};

// DOM elements (cached on init)
let triviaElements = {};

function cacheTriviaElements() {
  triviaElements = {
    correct: document.getElementById('trivia-correct'),
    incorrect: document.getElementById('trivia-incorrect'),
    category: document.getElementById('trivia-category'),
    question: document.getElementById('trivia-question'),
    choices: document.getElementById('trivia-choices'),
    feedback: document.getElementById('trivia-feedback'),
    nextBtn: document.getElementById('trivia-next-btn')
  };
}

function pickRandomQuestion() {
  // Reset pool if all questions have been used
  if (triviaState.usedIndices.length >= TRIVIA_QUESTIONS.length) {
    triviaState.usedIndices = [];
  }

  let index;
  do {
    index = Math.floor(Math.random() * TRIVIA_QUESTIONS.length);
  } while (triviaState.usedIndices.includes(index));

  triviaState.usedIndices.push(index);
  triviaState.currentQuestionIndex = index;
  triviaState.currentQuestion = TRIVIA_QUESTIONS[index];
  triviaState.answered = false;
}

function renderQuestion() {
  const q = triviaState.currentQuestion;

  triviaElements.category.textContent = q.category;
  triviaElements.question.textContent = q.question;

  // Render answer buttons
  triviaElements.choices.innerHTML = q.choices.map((choice, i) =>
    `<button class="trivia-choice-btn" data-index="${i}">${escapeHtml(choice)}</button>`
  ).join('');

  // Bind click handlers
  triviaElements.choices.querySelectorAll('.trivia-choice-btn').forEach(btn => {
    btn.addEventListener('click', () => handleAnswer(parseInt(btn.dataset.index)));
  });

  // Reset feedback and next button
  triviaElements.feedback.className = 'trivia-feedback';
  triviaElements.feedback.textContent = '';
  triviaElements.nextBtn.style.display = 'none';
}

function handleAnswer(selectedIndex) {
  if (triviaState.answered) return;
  triviaState.answered = true;

  const q = triviaState.currentQuestion;
  const isCorrect = selectedIndex === q.correctIndex;
  const buttons = triviaElements.choices.querySelectorAll('.trivia-choice-btn');

  // Disable all buttons
  buttons.forEach(btn => btn.disabled = true);

  // Highlight selected answer
  if (isCorrect) {
    buttons[selectedIndex].classList.add('selected-correct');
    triviaState.correctCount++;
    triviaElements.feedback.className = 'trivia-feedback correct';
    triviaElements.feedback.textContent = 'Correct! ' + q.explanation;
  } else {
    buttons[selectedIndex].classList.add('selected-wrong');
    buttons[q.correctIndex].classList.add('reveal-correct');
    triviaState.incorrectCount++;
    triviaElements.feedback.className = 'trivia-feedback incorrect';
    triviaElements.feedback.textContent = 'Wrong! ' + q.explanation;
  }

  // Update scores
  triviaElements.correct.textContent = triviaState.correctCount;
  triviaElements.incorrect.textContent = triviaState.incorrectCount;

  // Show next button
  triviaElements.nextBtn.style.display = 'inline-block';
}

function nextQuestion() {
  pickRandomQuestion();
  renderQuestion();
}

function initTrivia() {
  if (triviaState.initialized) return;
  triviaState.initialized = true;

  cacheTriviaElements();

  // Bind next button
  triviaElements.nextBtn.addEventListener('click', nextQuestion);

  // Load first question
  pickRandomQuestion();
  renderQuestion();
}
