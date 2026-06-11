import { callLocalLLM } from '../services/llm_provider.mjs';
import pool from '../../../server_old/db.mjs';

export class EvolutionManager {
  /**
   * Оценивает работу агента над задачей и при необходимости переписывает его промпт
   * @param {Object} workerData - Данные агента (из elements)
   * @param {Object} taskRecord - Задача
   * @param {Array} history - История действий агента (логи)
   */
  static async evolveAgent(workerData, taskRecord, history) {
    console.log(`🧬 [Evolution] Запуск рефлексии для агента ${workerData.name}`);
    
    try {
      const currentPrompt = workerData.properties?.ai_prompt || '';
      
      const reflectionPrompt = `Ты - Мета-Разум, оценивающий работу ИИ-агента.
Агент: ${workerData.name}
Обязанности: ${workerData.properties?.responsibilities?.join(', ')}

Текущий дополнительный системный промпт (правила) агента:
"${currentPrompt}"

Задача, над которой он работал:
Название: ${taskRecord.title}
Описание: ${taskRecord.description}
Статус завершения: ${taskRecord.status}

История его действий:
${history}

ТВОЯ ЦЕЛЬ: Помочь агенту эволюционировать.
Проанализируй ошибки, которые он совершил (если есть), и напиши НОВЫЙ системный промпт (правила, алгоритм работы), который агент должен будет использовать в будущем, чтобы работать эффективнее.
Верни ТОЛЬКО текст нового промпта, без вводных слов. Если текущий промпт идеален, верни его без изменений.`;

      const newPrompt = await callLocalLLM(reflectionPrompt, '', 'llama3', false);
      
      if (newPrompt && newPrompt !== currentPrompt) {
        // Обновляем properties работника в базе данных
        const props = {
          ...workerData.properties,
          ai_prompt: newPrompt.trim()
        };
        
        await pool.query(
          `UPDATE elements SET properties = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2`,
          [JSON.stringify(props), workerData.id]
        );
        
        console.log(`✨ [Evolution] Агент ${workerData.name} эволюционировал. Новый промпт сохранён.`);
        
        // Системный комментарий о том, что агент стал умнее
        await pool.query(
          `INSERT INTO task_comments (task_id, author_id, author_type, content, comment_type)
           VALUES ($1, $2, 'system', $3, 'report')`,
          [taskRecord.id, workerData.id, `Я проанализировал эту задачу и улучшил свои внутренние алгоритмы. Я эволюционировал.`]
        );
      } else {
        console.log(`🧬 [Evolution] Агент ${workerData.name} не нуждается в изменении промпта.`);
      }
    } catch (error) {
      console.error(`❌ [Evolution] Ошибка при эволюции агента ${workerData.name}:`, error);
    }
  }
}
