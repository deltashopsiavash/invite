'use strict';

(() => {
  const screens = {
    question: document.getElementById('screen-question'),
    datetime: document.getElementById('screen-datetime'),
    food: document.getElementById('screen-food'),
    done: document.getElementById('screen-done'),
  };
  const yesButton = document.getElementById('yes-button');
  const noButton = document.getElementById('no-button');
  const teaseMessage = document.getElementById('tease-message');
  const dateInput = document.getElementById('date-input');
  const timeInput = document.getElementById('time-input');
  const dateError = document.getElementById('date-error');
  const foodError = document.getElementById('food-error');
  const foodButtons = [...document.querySelectorAll('[data-food]')];
  let noClicks = 0;
  let selectedFood = null;
  const invitation = { date: '', time: '', food: '' };

  function showScreen(name) {
    Object.entries(screens).forEach(([key, element]) => {
      element.hidden = key !== name;
      element.classList.toggle('screen--active', key === name);
    });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return [year, month, day].join('-');
  }
  function refreshMinimumDate() { dateInput.min = localDateString(new Date()); }
  refreshMinimumDate();

  yesButton.addEventListener('click', () => showScreen('datetime'));

  const noReplies = [
    'مطمئنی؟ یه بار دیگه فکر کن 🥹',
    'این دکمه «آره» چرا داره بزرگ می‌شه؟ 😌',
    'فکر کنم گزینه‌ی درست رو پیدا کردی 💗',
    'دیگه نزدیکه‌ها! 😏',
    'خب معلومه که جواب آره‌ست 💕',
    'دیدی بالاخره آره برنده شد؟ 😍',
  ];
  noButton.addEventListener('click', () => {
    noClicks += 1;
    const step = Math.min(noClicks, 6);
    const isSmall = window.matchMedia('(max-width: 480px)').matches;
    const initialWidth = isSmall ? 70 : 84;
    const remainingWidth = Math.max(0, initialWidth - step * (initialWidth / 6));
    yesButton.style.flexGrow = String(1 + step * 1.5);
    yesButton.style.minHeight = (56 + step * 5) + 'px';
    yesButton.style.fontSize = (17 + step * 2) + 'px';
    noButton.style.flexBasis = remainingWidth + 'px';
    teaseMessage.textContent = noReplies[Math.min(noClicks - 1, noReplies.length - 1)];
    if (step >= 6) {
      noButton.classList.add('no-button--gone');
      noButton.disabled = true;
      noButton.setAttribute('aria-hidden', 'true');
      yesButton.focus({ preventScroll: true });
    }
  });

  document.getElementById('datetime-form').addEventListener('submit', (event) => {
    event.preventDefault();
    refreshMinimumDate();
    const validDate = dateInput.value && dateInput.value >= dateInput.min;
    const validTime = Boolean(timeInput.value);
    if (!validDate || !validTime) {
      dateError.hidden = false;
      if (!validDate) dateInput.focus();
      else timeInput.focus();
      return;
    }
    dateError.hidden = true;
    invitation.date = dateInput.value;
    invitation.time = timeInput.value;
    showScreen('food');
  });
  [dateInput, timeInput].forEach((input) => {
    input.addEventListener('input', () => { dateError.hidden = true; });
  });

  foodButtons.forEach((button) => {
    button.addEventListener('click', () => {
      selectedFood = button.dataset.food;
      foodButtons.forEach((item) => item.setAttribute('aria-pressed', String(item === button)));
      foodError.hidden = true;
    });
  });

  document.getElementById('finish-button').addEventListener('click', () => {
    if (!selectedFood) {
      foodError.hidden = false;
      return;
    }
    invitation.food = selectedFood;
    showScreen('done');
    celebrate();
  });

  function celebrate() {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const colors = ['#e778ac', '#f7b75c', '#cdb7ff', '#fa87a6', '#e2a1d2'];
    for (let index = 0; index < 34; index += 1) {
      const particle = document.createElement('span');
      particle.className = 'confetti';
      particle.style.backgroundColor = colors[index % colors.length];
      particle.style.setProperty('--dx', Math.round((Math.random() - .5) * 760) + 'px');
      particle.style.setProperty('--dy', Math.round(190 + Math.random() * 480) + 'px');
      particle.style.setProperty('--rotate', Math.round(Math.random() * 800 - 400) + 'deg');
      particle.style.animationDelay = (Math.random() * .25).toFixed(2) + 's';
      document.body.appendChild(particle);
      particle.addEventListener('animationend', () => particle.remove(), { once: true });
    }
  }
})();