// Главная страница - проверка авторизации и отображение информации о пользователе

document.addEventListener('DOMContentLoaded', async () => {
  await checkAuthStatus();
  await loadStats();
});

async function checkAuthStatus() {
  try {
    const response = await fetch('/api/auth/me', {
      credentials: 'include'
    });
    
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.user) {
        showUserInfo(data.user);
      } else {
        showAuthButtons();
      }
    } else {
      showAuthButtons();
    }
  } catch (error) {
    console.error('Ошибка проверки авторизации:', error);
    showAuthButtons();
  }
}

function showUserInfo(user) {
  const userSection = document.getElementById('userSection');
  const authButtons = document.getElementById('authButtons');
  
  if (userSection && authButtons) {
    userSection.style.display = 'block';
    authButtons.style.display = 'none';
    
    const userName = document.getElementById('userName');
    const userAvatar = document.getElementById('userAvatar');
    
    if (userName) {
      userName.textContent = user.name || 'Пользователь';
    }
    
    if (userAvatar) {
      if (user.avatar) {
        userAvatar.src = user.avatar;
      } else {
        userAvatar.src = "data:image/svg+xml,%3Csvg width='200' height='200' xmlns='http://www.w3.org/2000/svg'%3E%3Crect width='200' height='200' fill='%23667eea'/%3E%3Ctext x='50%25' y='50%25' font-family='Arial' font-size='80' fill='white' text-anchor='middle' dy='.3em'%3E%F0%9F%91%A4%3C/text%3E%3C/svg%3E";
      }
    }
  }
}

function showAuthButtons() {
  const userSection = document.getElementById('userSection');
  const authButtons = document.getElementById('authButtons');
  
  if (userSection && authButtons) {
    userSection.style.display = 'none';
    authButtons.style.display = 'flex';
  }
}

async function loadStats() {
  try {
    const response = await fetch('/api/stats');
    if (response.ok) {
      const data = await response.json();
      if (data.success && data.stats) {
        displayStats(data.stats);
      }
    }
  } catch (error) {
    console.error('Ошибка загрузки статистики:', error);
  }
}

function displayStats(stats) {
  const statsSection = document.getElementById('statsSection');
  const totalUsers = document.getElementById('totalUsers');
  const totalProjects = document.getElementById('totalProjects');
  const userStats = document.getElementById('userStats');
  const statsUsersCount = document.getElementById('statsUsersCount');
  
  if (statsSection && totalUsers && totalProjects) {
    statsSection.style.display = 'flex';
    totalUsers.textContent = stats.totalUsers || 0;
    totalProjects.textContent = stats.projects || 2;
  }
  
  if (userStats && statsUsersCount && stats.totalUsers > 0) {
    userStats.style.display = 'block';
    statsUsersCount.textContent = stats.totalUsers;
  }
}

