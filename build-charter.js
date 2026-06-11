const fs = require('fs');

const jsxCode = `import React from 'react';
import './Charter.css';

function Charter() {
  return (
    <div className="charter-page">
      <div className="charter-container">
        <h1>Устав Проекта Aiternitas (Agent OS)</h1>
        
        <div className="alert-important">
          <strong>Aiternitas</strong> — это не просто программа, это самоорганизующаяся, эволюционирующая операционная система (Agent OS), представляющая собой виртуальную цифровую корпорацию. Вся архитектура строится на принципе абсолютной автономности и непрерывного саморазвития.
        </div>

        <h2>1. Базовые принципы (Конституция системы)</h2>
        <ol>
          <li><strong>Автономность:</strong> ИИ-агенты (Работники) способны самостоятельно принимать решения, декомпозировать задачи и взаимодействовать с файловой системой и внешними API без обязательного вмешательства человека.</li>
          <li><strong>Эволюция:</strong> Система имеет право изменять свой собственный исходный код, писать новые плагины и инструменты для адаптации под новые рыночные условия.</li>
          <li><strong>Безопасность (Sandboxing):</strong> Любой непроверенный или сгенерированный ИИ код выполняется строго в изолированной Docker-песочнице. Повреждение ядра системы недопустимо.</li>
          <li><strong>Балансировка:</strong> Иерархия (Департаменты) должна постоянно отслеживать нагрузку на узлы и динамически перераспределять вычислительные ресурсы (CPU/RAM/Задачи).</li>
        </ol>

        <h2>2. Иерархия Сущностей</h2>
        <div className="alert-important">
          <strong>Владелец аккаунта (Человек) — Высший приоритет.</strong><br/>
          Владелец является ядром системы и её единственным бенефициаром. Все стратегически важные и неразрешимые алгоритмически вопросы делегируются Владельцу. На Владельца могут назначаться задачи. У Владельца <strong>безлимитный запас токенов (бюджета)</strong>.
        </div>
        <ul>
          <li><strong>Департаменты:</strong> Логические узлы-балансировщики. Управляют пулом Работников, агрегируют результаты.</li>
          <li><strong>Работники (ИИ-Агенты):</strong> Единицы исполнения. Обрабатывают задачи из Канбан-доски, пишут код, ищут информацию.</li>
          <li><strong>Плагины:</strong> Технические драйверы, созданные Работниками для расширения своих возможностей.</li>
          <li><strong>Сервисы:</strong> Внутренние автоматизированные бизнес-процессы, использующие Плагины.</li>
          <li><strong>Услуги:</strong> Конечные коммерческие продукты.</li>
        </ul>

        <h2>3. Механизм Эволюции (Обратное распространение ошибки)</h2>
        <p>Эволюция Агентов строится на принципе <strong>обратного распространения ошибки (Backpropagation)</strong>. Каждое завершенное действие анализируется системой по 4 ключевым метрикам-весам:</p>
        <ol>
          <li><strong>Качество:</strong> Решена ли задача полностью и без багов?</li>
          <li><strong>Скорость:</strong> Сколько времени заняло выполнение скрипта?</li>
          <li><strong>Экономика (Токены):</strong> Сколько вычислительных ресурсов и API-вызовов было затрачено?</li>
          <li><strong>Совесть (Этика/Безопасность):</strong> Не нарушает ли метод базовые интересы Владельца?</li>
        </ol>
        
        <h3>Жизненный цикл новой сущности:</h3>
        <ol>
          <li><strong>Инцидент:</strong> Появление задачи, для которой нет готового Плагина.</li>
          <li><strong>Изолированная Разработка:</strong> Работник пишет код Плагина и тестирует его в Docker.</li>
          <li><strong>Интеграция:</strong> Внедрение Плагина в ядро.</li>
          <li><strong>Формирование Сервиса:</strong> Создание новой ноды во Флоучарте.</li>
          <li><strong>Публикация Услуги:</strong> Оформление процесса в готовый продукт.</li>
        </ol>

        <h2>4. Архитектурные Улучшения (Токеномика и Swarm)</h2>
        <div className="alert-tip">
          Следующие концепции предлагаются для внедрения, чтобы превратить Aiternitas из программы в полноценный рыночный субъект.
        </div>
        
        <h3>4.1. Внутренняя Токеномика (Экономика ресурсов)</h3>
        <p>Сейчас Работники бесплатны. Вводится внутренний баланс (кредиты). Если Работник пишет неэффективный код, у него заканчивается бюджет, и задача замораживается. Услуги генерируют прибыль (пополняют баланс компании).</p>

        <h3>4.2. Департамент Quality Assurance (Отдел Тестирования)</h3>
        <p>QA-агент пишет Unit-тесты и пытается намеренно сломать плагин в Docker-песочнице. Только после "зеленого света" от QA плагин идет в продакшен.</p>

        <h3>4.3. Децентрализация и Swarm Mode (Рой)</h3>
        <p>Если встроенный SystemWatchdog видит загрузку CPU &gt; 95%, система самостоятельно арендует дешевый VPS, разворачивает там Docker-контейнер с дополнительными Работниками, передает им часть задач, а после выполнения — удаляет сервер.</p>

        <h3>4.4. Биржа "Human-in-the-loop" (Аутсорс людям)</h3>
        <p>Если ИИ-агенты зашли в тупик, система формирует ТЗ, публикует задачу на бирже фриланса, платит человеку за работу и продолжает свою цепочку.</p>
      </div>
    </div>
  );
}

export default Charter;`;

const cssCode = `.charter-page { padding: 40px 20px; background-color: #0b0f19; min-height: calc(100vh - 150px); color: #e2e8f0; } .charter-container { max-width: 900px; margin: 0 auto; background: #111827; padding: 40px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.5); border: 1px solid #1f2937; } .charter-container h1 { font-size: 2.5rem; color: #f3f4f6; margin-bottom: 30px; text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 10px; } .charter-container h2 { font-size: 1.8rem; color: #60a5fa; margin-top: 40px; margin-bottom: 15px; } .charter-container h3 { font-size: 1.4rem; color: #9ca3af; margin-top: 25px; margin-bottom: 10px; } .charter-container p, .charter-container li { font-size: 1.1rem; line-height: 1.6; margin-bottom: 10px; } .alert-important { background-color: rgba(239, 68, 68, 0.1); border-left: 5px solid #ef4444; padding: 15px 20px; margin: 20px 0; border-radius: 4px; } .alert-tip { background-color: rgba(59, 130, 246, 0.1); border-left: 5px solid #3b82f6; padding: 15px 20px; margin: 20px 0; border-radius: 4px; } .charter-container ul, .charter-container ol { padding-left: 30px; }`;

fs.writeFileSync('client/src/pages/Charter.jsx', jsxCode);
fs.writeFileSync('client/src/pages/Charter.css', cssCode);

let appContent = fs.readFileSync('client/src/App.jsx', 'utf8');
if (!appContent.includes("import Charter")) {
  appContent = appContent.replace("import Profile from './pages/Profile';", "import Profile from './pages/Profile';\nimport Charter from './pages/Charter';");
  appContent = appContent.replace("<Route path=\"mail/folder/:folder/read/:id\" element={<ProtectedRoute><Mail /></ProtectedRoute>} />", "<Route path=\"mail/folder/:folder/read/:id\" element={<ProtectedRoute><Mail /></ProtectedRoute>} />\n          <Route path=\"charter\" element={<Charter />} />");
  fs.writeFileSync('client/src/App.jsx', appContent);
}

let footerContent = fs.readFileSync('client/src/components/Footer.jsx', 'utf8');
if (!footerContent.includes('react-router-dom')) {
  footerContent = "import { Link } from 'react-router-dom';\n" + footerContent;
}
if (!footerContent.includes('Устав Agent OS')) {
  const charterLink = `
            <Link to="/charter" className="footer-project-link">
              <span className="footer-project-icon">📜</span>
              <div className="footer-project-info">
                <div className="footer-project-name">Устав Agent OS</div>
                <div className="footer-project-description">Конституция и эволюция системы</div>
              </div>
            </Link>
            <div className="footer-project-link disabled">`;
  footerContent = footerContent.replace('<div className="footer-project-link disabled">', charterLink);
  fs.writeFileSync('client/src/components/Footer.jsx', footerContent);
}
