
import pool from './db.mjs';

async function migrateFlowcharts() {
  console.log('🔄 Начинаем миграцию из "flowcharts" в "elements/connections"...');
  const client = await pool.connect();

  try {
    // 1. Prepare Schema Changes
    console.log('🛠️ Подготовка схемы БД...');

    // Remove functionality-limiting constraint
    await client.query(`
      DO $$ 
      BEGIN
        IF EXISTS (
          SELECT 1 FROM information_schema.constraint_column_usage 
          WHERE table_name = 'elements' AND constraint_name = 'elements_element_type_check'
        ) THEN
          ALTER TABLE elements DROP CONSTRAINT elements_element_type_check;
          RAISE NOTICE 'Constraint elements_element_type_check dropped';
        END IF;
      END $$;
    `);

    // Add 'properties' column if missing
    await client.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM information_schema.columns 
          WHERE table_name = 'elements' AND column_name = 'properties'
        ) THEN
          ALTER TABLE elements ADD COLUMN properties JSONB DEFAULT '{}';
          RAISE NOTICE 'Column properties added to elements';
        END IF;
      END $$;
    `);

    await client.query('BEGIN');

    // 2. Get all flowcharts
    const flowchartsResult = await client.query('SELECT * FROM flowcharts');
    const flowcharts = flowchartsResult.rows;

    console.log(`📊 Найдено ${flowcharts.length} схем для миграции.`);

    let totalElements = 0;
    let totalConnections = 0;

    for (const flowchart of flowcharts) {
      const { user_id, elements, connections, created_at, updated_at } = flowchart;

      console.log(`Обработка схемы "${flowchart.name}" (ID: ${flowchart.id}) для пользователя ${user_id}...`);
      const timestamp = updated_at || created_at || new Date();

      // 3. Migrate Elements
      if (Array.isArray(elements) && elements.length > 0) {

        // Pass 1: Insert elements without parent_id (to avoid immediate specific parent FK errors)
        for (const el of elements) {
          // JSON el: { id, type, name, description, position: {x,y}, position3d, parentId, color, properties... }

          const pos2d = el.position ? JSON.stringify(el.position) : null;
          const pos3d = el.position3d ? JSON.stringify(el.position3d) : null;
          const properties = el.properties ? JSON.stringify(el.properties) : '{}';

          await client.query(`
            INSERT INTO elements (
              id, user_id, name, description, element_type, type, 
              parent_id, position_2d, position, properties, color, created_at, updated_at
            ) VALUES (
              $1, $2, $3, $4, $5, $6, 
              NULL, $7, $8, $9, $10, $11, $12
            )
            ON CONFLICT (id) DO UPDATE SET
              name = EXCLUDED.name,
              description = EXCLUDED.description,
              element_type = EXCLUDED.element_type,
              type = EXCLUDED.type,
              position_2d = EXCLUDED.position_2d,
              position = EXCLUDED.position,
              properties = EXCLUDED.properties,
              color = EXCLUDED.color,
              updated_at = EXCLUDED.updated_at
          `, [
            el.id,
            user_id,
            el.name || 'Unnamed',
            el.description || '',
            el.type, // Use the actual type string (department, worker, etc)
            el.type, // Duplicate in 'type' column for safety
            pos2d,
            pos3d,
            properties,
            el.color,
            created_at,
            timestamp
          ]);
        }

        // Pass 2: Update parent_id
        for (const el of elements) {
          if (el.parentId) {
            // Verify if parent exists to avoid FK error
            // (It should exist since we just inserted all elements from this flowchart)
            await client.query(`
               UPDATE elements 
               SET parent_id = $1 
               WHERE id = $2 AND user_id = $3
               AND EXISTS (SELECT 1 FROM elements WHERE id = $1)
             `, [el.parentId, el.id, user_id]);
          }
        }

        totalElements += elements.length;
      }

      // 4. Migrate Connections
      if (Array.isArray(connections) && connections.length > 0) {
        for (const conn of connections) {
          // Check if endpoints exist (clean up database integrity)
          const validEndpoints = await client.query(`
            SELECT 1 FROM elements WHERE id = $1 
            UNION ALL 
            SELECT 1 FROM elements WHERE id = $2
          `, [conn.from, conn.to]);

          if (validEndpoints.rows.length === 2) {
            await client.query(`
              INSERT INTO elements_connections (
                id, user_id, from_element_id, to_element_id, 
                type, bidirectional, label, created_at, updated_at
              ) VALUES (
                $1, $2, $3, $4, 
                $5, $6, $7, $8, $9
              )
              ON CONFLICT (id) DO NOTHING
            `, [
              conn.id,
              user_id,
              conn.from,
              conn.to,
              conn.type || 'one-way',
              conn.direction === 'bidirectional',
              conn.label || '',
              created_at,
              updated_at || new Date()
            ]);
          } else {
            console.warn(`Skipping connection ${conn.id}: endpoints not found.`);
          }

        }
        totalConnections += connections.length;
      }
    }

    await client.query('COMMIT');
    console.log(`✅ Миграция завершена успешно!`);
    console.log(`   - Элементов перенесено: ${totalElements}`);
    console.log(`   - Связей перенесено: ${totalConnections}`);

  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Ошибка миграции:', error);
    process.exit(1);
  } finally {
    client.release();
    pool.end();
  }
}

migrateFlowcharts();
