import { useState } from 'react';
import { useSceneStore } from '../../store/sceneStore';
import MoveArrow from './MoveArrow';
import { checkPositionCollision } from '../../utils/collisionUtils';

function MoveArrows({ entity, size, sphereRadius }) {
  const updateEntity = useSceneStore((state) => state.updateEntity);
  const entities = useSceneStore((state) => state.entities);
  const [sx, sy, sz] = size || [1, 1, 1];
  const [hoveredDirection, setHoveredDirection] = useState(null);

  // Расстояние для перемещения равно размеру куба или сферы
  const moveDistance = sphereRadius ? sphereRadius * 2 : Math.max(sx, sy, sz);
  
  // Если есть сфера, стрелки должны быть на её краях, иначе на краях куба
  const radiusForArrows = sphereRadius || Math.max(sx, sy, sz) / 2;

  const handleArrowClick = (direction, e) => {
    e.stopPropagation();
    
    const [currentX, currentY, currentZ] = entity.position;
    let newPosition = [currentX, currentY, currentZ];

    switch (direction) {
      case 'up': // +Y
        newPosition = [currentX, currentY + moveDistance, currentZ];
        break;
      case 'down': // -Y
        newPosition = [currentX, currentY - moveDistance, currentZ];
        break;
      case 'right': // +X
        newPosition = [currentX + moveDistance, currentY, currentZ];
        break;
      case 'left': // -X
        newPosition = [currentX - moveDistance, currentY, currentZ];
        break;
      case 'forward': // +Z
        newPosition = [currentX, currentY, currentZ + moveDistance];
        break;
      case 'back': // -Z
        newPosition = [currentX, currentY, currentZ - moveDistance];
        break;
    }

    // Проверяем коллизии перед перемещением
    const hasCollision = checkPositionCollision(
      newPosition,
      entity.size || [1, 1, 1],
      entity.type || 'box',
      entities,
      entity.id // Исключаем текущую сущность из проверки
    );

    // Если нет коллизии, перемещаем
    if (!hasCollision) {
      updateEntity(entity.id, { position: newPosition });
    } else {
      // Можно добавить визуальную обратную связь (например, мигание)
      console.log('Перемещение заблокировано: коллизия с другим объектом');
    }
  };

  const handleHover = (direction) => {
    setHoveredDirection(direction);
  };

  const handleLeave = () => {
    setHoveredDirection(null);
  };

  // Размер стрелок зависит от размера сферы или куба
  const arrowSize = radiusForArrows * 0.3;

  // Стрелки должны быть в группе, которая следует за позицией куба
  return (
    <group position={[0, 0, 0]}>
      {/* Стрелка вверх (+Y) */}
      <MoveArrow
        direction="up"
        position={[0, radiusForArrows + arrowSize * 0.5, 0]}
        rotation={[0, 0, 0]}
        color="#00ff00"
        onClick={(e) => handleArrowClick('up', e)}
        onHover={() => handleHover('up')}
        onLeave={handleLeave}
        isHovered={hoveredDirection === 'up'}
        otherHovered={hoveredDirection !== null && hoveredDirection !== 'up'}
        arrowSize={arrowSize}
      />

      {/* Стрелка вниз (-Y) */}
      <MoveArrow
        direction="down"
        position={[0, -radiusForArrows - arrowSize * 0.5, 0]}
        rotation={[Math.PI, 0, 0]}
        color="#ff0000"
        onClick={(e) => handleArrowClick('down', e)}
        onHover={() => handleHover('down')}
        onLeave={handleLeave}
        isHovered={hoveredDirection === 'down'}
        otherHovered={hoveredDirection !== null && hoveredDirection !== 'down'}
        arrowSize={arrowSize}
      />

      {/* Стрелка вправо (+X) */}
      <MoveArrow
        direction="right"
        position={[radiusForArrows + arrowSize * 0.5, 0, 0]}
        rotation={[0, 0, -Math.PI / 2]}
        color="#0000ff"
        onClick={(e) => handleArrowClick('right', e)}
        onHover={() => handleHover('right')}
        onLeave={handleLeave}
        isHovered={hoveredDirection === 'right'}
        otherHovered={hoveredDirection !== null && hoveredDirection !== 'right'}
        arrowSize={arrowSize}
      />

      {/* Стрелка влево (-X) */}
      <MoveArrow
        direction="left"
        position={[-radiusForArrows - arrowSize * 0.5, 0, 0]}
        rotation={[0, 0, Math.PI / 2]}
        color="#ffff00"
        onClick={(e) => handleArrowClick('left', e)}
        onHover={() => handleHover('left')}
        onLeave={handleLeave}
        isHovered={hoveredDirection === 'left'}
        otherHovered={hoveredDirection !== null && hoveredDirection !== 'left'}
        arrowSize={arrowSize}
      />

      {/* Стрелка вперед (+Z) */}
      <MoveArrow
        direction="forward"
        position={[0, 0, radiusForArrows + arrowSize * 0.5]}
        rotation={[Math.PI / 2, 0, 0]}
        color="#ff00ff"
        onClick={(e) => handleArrowClick('forward', e)}
        onHover={() => handleHover('forward')}
        onLeave={handleLeave}
        isHovered={hoveredDirection === 'forward'}
        otherHovered={hoveredDirection !== null && hoveredDirection !== 'forward'}
        arrowSize={arrowSize}
      />

      {/* Стрелка назад (-Z) */}
      <MoveArrow
        direction="back"
        position={[0, 0, -radiusForArrows - arrowSize * 0.5]}
        rotation={[-Math.PI / 2, 0, 0]}
        color="#00ffff"
        onClick={(e) => handleArrowClick('back', e)}
        onHover={() => handleHover('back')}
        onLeave={handleLeave}
        isHovered={hoveredDirection === 'back'}
        otherHovered={hoveredDirection !== null && hoveredDirection !== 'back'}
        arrowSize={arrowSize}
      />
    </group>
  );
}

export default MoveArrows;

