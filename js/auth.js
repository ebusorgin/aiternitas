// Общие функции для регистрации и входа

document.addEventListener('DOMContentLoaded', () => {
  const isRegisterPage = document.getElementById('registerForm');
  const isLoginPage = document.getElementById('loginForm');

  if (isRegisterPage) {
    isRegisterPage.addEventListener('submit', handleRegister);
  }

  if (isLoginPage) {
    isLoginPage.addEventListener('submit', handleLogin);
  }
});

async function handleRegister(e) {
  e.preventDefault();
  
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const errorDiv = document.getElementById('errorMessage');
  const successDiv = document.getElementById('successMessage');

  const formData = {
    name: form.name.value.trim(),
    email: form.email.value.trim(),
    password: form.password.value
  };

  // Валидация
  if (!formData.name || !formData.email || !formData.password) {
    showError('Все поля обязательны');
    return;
  }

  if (formData.password.length < 6) {
    showError('Пароль должен быть не менее 6 символов');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Регистрация...';
  hideMessages();

  try {
    const response = await fetch('/api/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (response.ok && data.success) {
      showSuccess('Регистрация успешна! Перенаправление...');
      setTimeout(() => {
        window.location.href = '/profile';
      }, 1500);
    } else {
      showError(data.error || 'Ошибка регистрации');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Зарегистрироваться';
    }
  } catch (error) {
    showError('Ошибка подключения к серверу');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Зарегистрироваться';
  }
}

async function handleLogin(e) {
  e.preventDefault();
  
  const form = e.target;
  const submitBtn = form.querySelector('button[type="submit"]');
  const errorDiv = document.getElementById('errorMessage');

  const formData = {
    email: form.email.value.trim(),
    password: form.password.value
  };

  if (!formData.email || !formData.password) {
    showError('Email и пароль обязательны');
    return;
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Вход...';
  hideMessages();

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify(formData)
    });

    const data = await response.json();

    if (response.ok && data.success) {
      window.location.href = '/profile';
    } else {
      showError(data.error || 'Ошибка входа');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Войти';
    }
  } catch (error) {
    showError('Ошибка подключения к серверу');
    submitBtn.disabled = false;
    submitBtn.textContent = 'Войти';
  }
}

function showError(message) {
  const errorDiv = document.getElementById('errorMessage');
  if (errorDiv) {
    errorDiv.textContent = message;
    errorDiv.style.display = 'block';
  }
}

function showSuccess(message) {
  const successDiv = document.getElementById('successMessage');
  if (successDiv) {
    successDiv.textContent = message;
    successDiv.style.display = 'block';
  }
}

function hideMessages() {
  const errorDiv = document.getElementById('errorMessage');
  const successDiv = document.getElementById('successMessage');
  if (errorDiv) errorDiv.style.display = 'none';
  if (successDiv) successDiv.style.display = 'none';
}

