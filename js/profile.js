// Личный кабинет

let currentUser = null;

document.addEventListener('DOMContentLoaded', async () => {
  await loadUserProfile();
  setupEventListeners();
});

async function loadUserProfile() {
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include' // Важно для отправки cookies
    });
    
    if (response.status === 401) {
      window.location.href = '/login';
      return;
    }

    if (!response.ok) {
      throw new Error('Ошибка загрузки профиля');
    }

    const data = await response.json();
    currentUser = data.user;

    // Заполняем форму
    document.getElementById('name').value = currentUser.name || '';
    document.getElementById('email').value = currentUser.email || '';
    
    if (currentUser.created_at) {
      const date = new Date(currentUser.created_at);
      document.getElementById('createdAt').value = date.toLocaleDateString('ru-RU');
    }

    // Устанавливаем аватар
    if (currentUser.avatar) {
      document.getElementById('avatarImg').src = currentUser.avatar;
    }
  } catch (error) {
    console.error('Ошибка загрузки профиля:', error);
    showMessage('Ошибка загрузки профиля', 'error');
  }
}

function setupEventListeners() {
  // Сохранение имени
  document.getElementById('profileForm').addEventListener('submit', handleNameUpdate);

  // Загрузка аватара
  document.getElementById('avatarInput').addEventListener('change', handleAvatarUpload);

  // Выход
  document.getElementById('logoutBtn').addEventListener('click', handleLogout);
}

async function handleNameUpdate(e) {
  e.preventDefault();
  
  const nameInput = document.getElementById('name');
  const newName = nameInput.value.trim();
  const saveBtn = e.target.querySelector('.btn-save');

  if (!newName) {
    showMessage('Имя не может быть пустым', 'error');
    return;
  }

  if (newName === currentUser.name) {
    showMessage('Имя не изменилось', 'error');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Сохранение...';

  try {
    const response = await fetch('/api/auth/profile/name', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include',
      body: JSON.stringify({ name: newName })
    });

    const data = await response.json();

    if (response.ok && data.success) {
      currentUser.name = data.user.name;
      showMessage('Имя успешно обновлено', 'success');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Сохранить';
    } else {
      showMessage(data.error || 'Ошибка обновления имени', 'error');
      saveBtn.disabled = false;
      saveBtn.textContent = 'Сохранить';
    }
  } catch (error) {
    showMessage('Ошибка подключения к серверу', 'error');
    saveBtn.disabled = false;
    saveBtn.textContent = 'Сохранить';
  }
}

async function handleAvatarUpload(e) {
  const file = e.target.files[0];
  
  if (!file) return;

  // Валидация размера (5MB)
  if (file.size > 5 * 1024 * 1024) {
    showMessage('Размер файла не должен превышать 5MB', 'error');
    return;
  }

  // Валидация типа
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
  if (!allowedTypes.includes(file.type)) {
    showMessage('Разрешены только изображения (jpeg, jpg, png, gif, webp)', 'error');
    return;
  }

  const formData = new FormData();
  formData.append('avatar', file);

  const avatarImg = document.getElementById('avatarImg');
  avatarImg.style.opacity = '0.5';

  try {
    const response = await fetch('/api/upload/avatar', {
      method: 'POST',
      credentials: 'include',
      body: formData
    });

    const data = await response.json();

    if (response.ok && data.success) {
      avatarImg.src = data.avatar;
      currentUser.avatar = data.avatar;
      showMessage('Аватар успешно загружен', 'success');
    } else {
      showMessage(data.error || 'Ошибка загрузки аватара', 'error');
    }
  } catch (error) {
    showMessage('Ошибка подключения к серверу', 'error');
  } finally {
    avatarImg.style.opacity = '1';
    e.target.value = ''; // Сброс input
  }
}

async function handleLogout() {
  try {
    const response = await fetch('/api/auth/logout', {
      method: 'POST',
      credentials: 'include'
    });

    if (response.ok) {
      window.location.href = '/';
    }
  } catch (error) {
    console.error('Ошибка выхода:', error);
  }
}

function showMessage(text, type) {
  const messageDiv = document.getElementById('message');
  messageDiv.textContent = text;
  messageDiv.className = `message ${type}`;
  messageDiv.style.display = 'block';

  setTimeout(() => {
    messageDiv.style.display = 'none';
  }, 5000);
}

