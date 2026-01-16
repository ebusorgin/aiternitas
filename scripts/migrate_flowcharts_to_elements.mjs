import pg from 'pg';
import dotenv from 'dotenv';
import { v4 as uuidv4 } from 'uuid';

// Load env from root
dotenv.config({ path: '../.env' });

const { Pool } = pg;

const dbConfig = {
    host: process.env.DB_HOST || '127.127.126.56',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    user: process.env.DB_USER || 'severomorets',
    database: process.env.DB_NAME || 'aiternitas',
};

if (process.env.DB_PASSWORD && process.env.DB_PASSWORD.trim() !== '') {
    dbConfig.password = String(process.env.DB_PASSWORD);
}

const pool = new Pool(dbConfig);

async function migrateFlowcharts() {
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        console.log('🚀 Starting migration of flowcharts to elements...');

        // 1. Get existing flowcharts
        const flowchartRes = await client.query('SELECT * FROM flowcharts');
        const flowcharts = flowchartRes.rows;

        for (const flowchart of flowcharts) {
            console.log(`Migrating flowchart: ${flowchart.name} (ID: ${flowchart.id})`);

            // Create a root element for the flowchart itself
            const rootElementId = uuidv4();
            await client.query(
                `INSERT INTO elements (
                    id, user_id, name, description, element_type,
                    position_2d, position, size_2d, size, color, emissive, background, show_grid,
                    created_at, updated_at, created_by
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
                [
                    rootElementId,
                    flowchart.user_id,
                    flowchart.name,
                    'Migrated flowchart root',
                    'flowchart_root', // New element_type for the flowchart itself
                    flowchart.view_state?.position_2d || null,
                    flowchart.view_state?.position || null,
                    flowchart.view_state?.size_2d || null,
                    flowchart.view_state?.size || null,
                    flowchart.view_state?.color || null,
                    flowchart.view_state?.emissive || null,
                    flowchart.view_state?.background || null,
                    flowchart.view_state?.show_grid || false,
                    flowchart.created_at,
                    flowchart.updated_at,
                    flowchart.user_id // Assuming flowchart.user_id is also created_by
                ]
            );
            console.log(`  Created root element: ${rootElementId}`);

            const oldToNewElementIdMap = {};

            // 2. Migrate nested elements from flowchart.elements JSONB
            for (const elementData of flowchart.elements) {
                const newElementId = uuidv4();
                oldToNewElementIdMap[elementData.id] = newElementId;

                // Determine parent_element_id from new element_parent_child_connections table
                let parentElementIdForNewTable = null;
                if (elementData.parentId) {
                    parentElementIdForNewTable = oldToNewElementIdMap[elementData.parentId];
                } else {
                    // If no explicit parentId in JSONB, link to the flowchart_root
                    parentElementIdForNewTable = rootElementId;
                }

                await client.query(
                    `INSERT INTO elements (
                        id, user_id, name, description, element_type,
                        position_2d, position, size_2d, size, color, emissive, background, show_grid,
                        created_at, updated_at, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
                    [
                        newElementId,
                        flowchart.user_id,
                        elementData.name || 'Untitled Element',
                        elementData.description || null,
                        elementData.elementType || 'block', // Default element type
                        elementData.position_2d || null,
                        elementData.position || null,
                        elementData.size_2d || null,
                        elementData.size || null,
                        elementData.color || null,
                        elementData.emissive || null,
                        elementData.background || null,
                        elementData.showGrid || false,
                        elementData.createdAt || flowchart.created_at,
                        elementData.updatedAt || flowchart.updated_at,
                        flowchart.user_id
                    ]
                );

                // Insert into element_parent_child_connections if a parent exists
                if (parentElementIdForNewTable) {
                    await client.query(
                        `INSERT INTO element_parent_child_connections (
                            parent_element_id, child_element_id, user_id, created_at, updated_at
                        ) VALUES ($1, $2, $3, $4, $5)`,
                        [
                            parentElementIdForNewTable,
                            newElementId,
                            flowchart.user_id,
                            elementData.createdAt || flowchart.created_at,
                            elementData.updatedAt || flowchart.updated_at
                        ]
                    );
                }
                console.log(`  Migrated nested element: ${elementData.name} (Old ID: ${elementData.id} -> New ID: ${newElementId})`);
            }

            // 3. Migrate connections from flowchart.connections JSONB
            for (const connectionData of flowchart.connections) {
                const newConnectionId = uuidv4();
                const fromElementNewId = oldToNewElementIdMap[connectionData.from];
                const toElementNewId = oldToNewElementIdMap[connectionData.to];

                if (!fromElementNewId || !toElementNewId) {
                    console.warn(`    Skipping connection ${connectionData.id}: one or both elements not found after migration.`);
                    continue;
                }

                await client.query(
                    `INSERT INTO elements_connections (
                        id, user_id, from_element_id, to_element_id, type, bidirectional, label, color,
                        created_at, updated_at, created_by
                    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
                    [
                        newConnectionId,
                        flowchart.user_id,
                        fromElementNewId,
                        toElementNewId,
                        connectionData.type || 'one-way',
                        connectionData.bidirectional || false,
                        connectionData.label || null,
                        connectionData.color || '#ffffff',
                        connectionData.createdAt || flowchart.created_at,
                        connectionData.updatedAt || flowchart.updated_at,
                        flowchart.user_id
                    ]
                );
                console.log(`  Migrated connection (Old ID: ${connectionData.id} -> New ID: ${newConnectionId})`);
            }
        }

        // 4. Drop the old flowcharts table
        await client.query('DROP TABLE IF EXISTS flowcharts CASCADE');
        console.log('✅ Dropped old flowcharts table.');

        await client.query('COMMIT');
        console.log('✅ Migration completed successfully!');
    } catch (error) {
        await client.query('ROLLBACK');
        console.error('❌ Migration failed:', error);
    } finally {
        client.release();
        await pool.end();
    }
}

migrateFlowcharts();