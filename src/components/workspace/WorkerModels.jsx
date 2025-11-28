import { useMemo } from 'react';
import { Box, Sphere, Cylinder, Cone } from '@react-three/drei';
import * as THREE from 'three';

// Базовые материалы для разных профессий
const createMaterial = (color, emissive, emissiveIntensity, metalness = 0.3, roughness = 0.7) => (
  <meshStandardMaterial
    color={color}
    emissive={emissive}
    emissiveIntensity={emissiveIntensity}
    metalness={metalness}
    roughness={roughness}
  />
);

// Детализированная рука - две части с локтем
function DetailedArm({ 
  position = [0, 0, 0], 
  rotation = [0, 0, 0],
  scale = 1, 
  color = '#fdbcb4', 
  emissive, 
  emissiveIntensity,
  side = 'left', // 'left' or 'right'
  upperArmAngle = 0, // Угол плеча (0 = горизонтально)
  forearmAngle = 0, // Угол предплечья относительно плеча
  armSpread = 0.2 // Размах руки от тела
}) {
  const armDir = side === 'left' ? -1 : 1;
  
  return (
    <group position={position} rotation={rotation}>
      <group rotation={[0, 0, upperArmAngle]}>
        {/* Плечо (верхняя часть) */}
        <Box args={[scale * 0.08, scale * 0.15, scale * 0.08]} position={[armDir * scale * armSpread, scale * 0.075, 0]}>
          {createMaterial(color, emissive, emissiveIntensity)}
        </Box>
        {/* Локтевой сустав */}
        <Sphere args={[scale * 0.06, 8, 8]} position={[armDir * scale * armSpread * 1.8, scale * 0.05, 0]}>
          {createMaterial(color, emissive, emissiveIntensity)}
        </Sphere>
        {/* Предплечье (нижняя часть) */}
        <group position={[armDir * scale * armSpread * 1.8, scale * 0.05, 0]} rotation={[0, 0, forearmAngle]}>
          <Box args={[scale * 0.07, scale * 0.15, scale * 0.07]} position={[armDir * scale * armSpread * 0.7, -scale * 0.03, 0]}>
            {createMaterial(color, emissive, emissiveIntensity)}
          </Box>
        </group>
      </group>
    </group>
  );
}

// Детализированная нога - две части с коленом
function DetailedLeg({ 
  position = [0, 0, 0], 
  scale = 1, 
  color = '#2c3e50', 
  emissive, 
  emissiveIntensity,
  side = 'left', // 'left' or 'right'
  thighAngle = 0, // Угол бедра (0 = вертикально)
  shinAngle = 0, // Угол голени относительно бедра
  legSpread = 0.08 // Размах ног
}) {
  const legDir = side === 'left' ? -1 : 1;
  
  return (
    <group position={position}>
      <group rotation={[0, 0, thighAngle]}>
        {/* Бедро (верхняя часть) */}
        <Box args={[scale * 0.1, scale * 0.18, scale * 0.1]} position={[legDir * scale * legSpread, -scale * 0.08, 0]}>
          {createMaterial(color, emissive, emissiveIntensity)}
        </Box>
        {/* Коленный сустав */}
        <Sphere args={[scale * 0.07, 8, 8]} position={[legDir * scale * legSpread, -scale * 0.18, 0]}>
          {createMaterial(color, emissive, emissiveIntensity)}
        </Sphere>
        {/* Голень (нижняя часть) */}
        <group position={[legDir * scale * legSpread, -scale * 0.18, 0]} rotation={[0, 0, shinAngle]}>
          <Box args={[scale * 0.09, scale * 0.17, scale * 0.09]} position={[0, -scale * 0.09, 0]}>
            {createMaterial(color, emissive, emissiveIntensity)}
          </Box>
        </group>
      </group>
    </group>
  );
}

// Детали лица - базовые элементы
function FaceDetails({ scale = 1, skinColor = '#fdbcb4', emissive, emissiveIntensity, position = [0, 0, 0] }) {
  return (
    <group position={position}>
      {/* Глаза */}
      {/* Левый глаз */}
      <Sphere args={[scale * 0.03, 8, 8]} position={[-scale * 0.06, scale * 0.32, scale * 0.12]}>
        {createMaterial('#ffffff', emissive, emissiveIntensity)}
      </Sphere>
      <Sphere args={[scale * 0.015, 8, 8]} position={[-scale * 0.06, scale * 0.32, scale * 0.135]}>
        {createMaterial('#000000', emissive, emissiveIntensity)}
      </Sphere>
      {/* Правый глаз */}
      <Sphere args={[scale * 0.03, 8, 8]} position={[scale * 0.06, scale * 0.32, scale * 0.12]}>
        {createMaterial('#ffffff', emissive, emissiveIntensity)}
      </Sphere>
      <Sphere args={[scale * 0.015, 8, 8]} position={[scale * 0.06, scale * 0.32, scale * 0.135]}>
        {createMaterial('#000000', emissive, emissiveIntensity)}
      </Sphere>
      {/* Рот */}
      <Box args={[scale * 0.04, scale * 0.01, scale * 0.01]} position={[0, scale * 0.26, scale * 0.12]}>
        {createMaterial('#8b4513', emissive, emissiveIntensity)}
      </Box>
    </group>
  );
}

// Усы
function Mustache({ scale = 1, position = [0, 0, 0], emissive, emissiveIntensity }) {
  return (
    <group position={position}>
      {/* Левая сторона усов */}
      <Box args={[scale * 0.04, scale * 0.01, scale * 0.01]} position={[-scale * 0.04, scale * 0.29, scale * 0.12]} rotation={[0, 0, Math.PI / 6]}>
        {createMaterial('#2c3e50', emissive, emissiveIntensity)}
      </Box>
      {/* Правая сторона усов */}
      <Box args={[scale * 0.04, scale * 0.01, scale * 0.01]} position={[scale * 0.04, scale * 0.29, scale * 0.12]} rotation={[0, 0, -Math.PI / 6]}>
        {createMaterial('#2c3e50', emissive, emissiveIntensity)}
      </Box>
    </group>
  );
}

// Борода
function Beard({ scale = 1, position = [0, 0, 0], style = 'short', emissive, emissiveIntensity }) {
  if (style === 'short') {
    return (
      <group position={position}>
        {/* Короткая борода */}
        <Box args={[scale * 0.1, scale * 0.06, scale * 0.01]} position={[0, scale * 0.22, scale * 0.12]}>
          {createMaterial('#2c3e50', emissive, emissiveIntensity)}
        </Box>
      </group>
    );
  } else if (style === 'medium') {
    return (
      <group position={position}>
        {/* Средняя борода */}
        <Box args={[scale * 0.12, scale * 0.1, scale * 0.01]} position={[0, scale * 0.18, scale * 0.12]}>
          {createMaterial('#2c3e50', emissive, emissiveIntensity)}
        </Box>
      </group>
    );
  }
  return null;
}

// Очки
function Glasses({ scale = 1, position = [0, 0, 0], emissive, emissiveIntensity }) {
  return (
    <group position={position}>
      {/* Оправа очков */}
      <Box args={[scale * 0.22, scale * 0.06, scale * 0.01]} position={[0, scale * 0.32, scale * 0.09]}>
        {createMaterial('#1a1a1a', emissive, emissiveIntensity)}
      </Box>
      {/* Левая линза */}
      <Cylinder args={[scale * 0.05, scale * 0.05, scale * 0.01, 16]} position={[-scale * 0.06, scale * 0.32, scale * 0.095]}>
        {createMaterial('#ffffff', emissive, emissiveIntensity, 0.1, 0.9)}
      </Cylinder>
      {/* Правая линза */}
      <Cylinder args={[scale * 0.05, scale * 0.05, scale * 0.01, 16]} position={[scale * 0.06, scale * 0.32, scale * 0.095]}>
        {createMaterial('#ffffff', emissive, emissiveIntensity, 0.1, 0.9)}
      </Cylinder>
    </group>
  );
}

// Генеральный директор - черный костюм, белая рубашка, черный галстук
export function GeneralDirector({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      <Beard scale={scale} style="short" emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Тело - разделенная одежда */}
      {/* Белая рубашка (базовый слой) */}
      <Box args={[scale * 0.2, scale * 0.35, scale * 0.14]} position={[0, scale * 0.05, 0]}>
        {createMaterial('#ffffff', emissive, emissiveIntensity)}
      </Box>
      {/* Черный пиджак (верхняя часть) */}
      <Box args={[scale * 0.22, scale * 0.25, scale * 0.15]} position={[0, scale * 0.125, 0]}>
        {createMaterial('#1a1a1a', emissive, emissiveIntensity)}
      </Box>
      {/* Черный галстук */}
      <Box args={[scale * 0.04, scale * 0.2, scale * 0.02]} position={[0, scale * 0.15, scale * 0.08]}>
        {createMaterial('#000000', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки - уверенная поза: руки за спиной */}
      <DetailedArm 
        position={[-scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#1a1a1a"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        upperArmAngle={-Math.PI / 2.5}
        forearmAngle={Math.PI / 3}
        armSpread={0.15}
      />
      <DetailedArm 
        position={[scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#1a1a1a"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        upperArmAngle={-Math.PI / 2.5}
        forearmAngle={Math.PI / 3}
        armSpread={0.15}
      />
      
      {/* Брюки (нижняя часть) */}
      <Box args={[scale * 0.2, scale * 0.2, scale * 0.15]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#1a1a1a', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - уверенная стойка, ноги слегка расставлены */}
      <DetailedLeg 
        position={[-scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#1a1a1a"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={-0.05}
        shinAngle={0.1}
      />
      <DetailedLeg 
        position={[scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#1a1a1a"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0.05}
        shinAngle={-0.1}
      />
    </group>
  );
}

// Менеджер - синий деловой костюм
export function Manager({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Одежда - разделенная */}
      {/* Рубашка */}
      <Box args={[scale * 0.2, scale * 0.35, scale * 0.14]} position={[0, scale * 0.05, 0]}>
        {createMaterial('#ffffff', emissive, emissiveIntensity)}
      </Box>
      {/* Пиджак (синий) */}
      <Box args={[scale * 0.22, scale * 0.25, scale * 0.15]} position={[0, scale * 0.125, 0]}>
        {createMaterial('#2c3e50', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки - формальная поза: руки по швам */}
      <DetailedArm 
        position={[-scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#2c3e50"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        upperArmAngle={-Math.PI / 6}
        forearmAngle={-Math.PI / 3}
        armSpread={0.18}
      />
      <DetailedArm 
        position={[scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#2c3e50"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        upperArmAngle={-Math.PI / 6}
        forearmAngle={-Math.PI / 3}
        armSpread={0.18}
      />
      
      {/* Брюки */}
      <Box args={[scale * 0.2, scale * 0.2, scale * 0.15]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#2c3e50', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - прямая стойка */}
      <DetailedLeg 
        position={[-scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#2c3e50"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={0}
        shinAngle={0}
      />
      <DetailedLeg 
        position={[scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#2c3e50"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0}
        shinAngle={0}
      />
    </group>
  );
}

// Бухгалтер - очки, документы
export function Accountant({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      <Glasses scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      <Mustache scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Одежда - разделенная */}
      {/* Рубашка */}
      <Box args={[scale * 0.2, scale * 0.35, scale * 0.14]} position={[0, scale * 0.05, 0]}>
        {createMaterial('#ffffff', emissive, emissiveIntensity)}
      </Box>
      {/* Жилет */}
      <Box args={[scale * 0.19, scale * 0.3, scale * 0.145]} position={[0, scale * 0.1, 0]}>
        {createMaterial('#34495e', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки - поза с документами: левая свободная, правая держит документы */}
      <DetailedArm 
        position={[-scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#34495e"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        upperArmAngle={-Math.PI / 4}
        forearmAngle={-Math.PI / 4}
        armSpread={0.16}
      />
      {/* Правая рука с документами - вытянута вперед */}
      <group position={[scale * 0.1, scale * 0.1, 0]}>
        <DetailedArm 
          position={[0, 0, 0]} 
          scale={scale} 
          color="#34495e"
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          side="right"
          upperArmAngle={Math.PI / 4}
          forearmAngle={Math.PI / 3}
          armSpread={0.2}
        />
        {/* Документы в руке */}
        <Box args={[scale * 0.12, scale * 0.18, scale * 0.02]} position={[scale * 0.45, scale * 0.15, 0]} rotation={[0, 0, Math.PI / 6]}>
          {createMaterial('#ffffff', emissive, emissiveIntensity)}
        </Box>
      </group>
      
      {/* Брюки */}
      <Box args={[scale * 0.2, scale * 0.2, scale * 0.15]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#34495e', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - слегка расставлены, рабочая поза */}
      <DetailedLeg 
        position={[-scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#34495e"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={-0.03}
        shinAngle={0.05}
      />
      <DetailedLeg 
        position={[scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#34495e"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0.03}
        shinAngle={-0.05}
      />
    </group>
  );
}

// Юрист - мантия
export function Lawyer({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      <Beard scale={scale} style="medium" emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Одежда - мантия (верхняя часть) */}
      <Box args={[scale * 0.26, scale * 0.5, scale * 0.2]} position={[0, scale * 0.1, 0]}>
        {createMaterial('#1a1a1a', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки - жестикуляция: одна рука поднята */}
      <DetailedArm 
        position={[-scale * 0.12, scale * 0.1, 0]} 
        scale={scale} 
        color="#1a1a1a"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        upperArmAngle={-Math.PI / 4}
        forearmAngle={-Math.PI / 4}
        armSpread={0.18}
      />
      <DetailedArm 
        position={[scale * 0.12, scale * 0.1, 0]} 
        scale={scale} 
        color="#1a1a1a"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        upperArmAngle={Math.PI / 3}
        forearmAngle={Math.PI / 2}
        armSpread={0.22}
      />
      
      {/* Брюки под мантией */}
      <Box args={[scale * 0.22, scale * 0.2, scale * 0.18]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#1a1a1a', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - уверенная стойка */}
      <DetailedLeg 
        position={[-scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#1a1a1a"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={-0.04}
        shinAngle={0.08}
      />
      <DetailedLeg 
        position={[scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#1a1a1a"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0.04}
        shinAngle={-0.08}
      />
    </group>
  );
}

// Водитель - руль перед ним
export function Driver({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Одежда - униформа */}
      {/* Рубашка/футболка */}
      <Box args={[scale * 0.2, scale * 0.35, scale * 0.14]} position={[0, scale * 0.05, 0]}>
        {createMaterial('#3498db', emissive, emissiveIntensity)}
      </Box>
      {/* Куртка водителя */}
      <Box args={[scale * 0.22, scale * 0.25, scale * 0.15]} position={[0, scale * 0.125, 0]}>
        {createMaterial('#2c3e50', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки - держат руль, естественная поза водителя */}
      <group position={[-scale * 0.1, scale * 0.1, scale * 0.2]} rotation={[0, 0, Math.PI / 6]}>
        <DetailedArm 
          position={[0, 0, 0]} 
          scale={scale * 0.8} 
          color="#2c3e50"
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          side="left"
          upperArmAngle={Math.PI / 3}
          forearmAngle={-Math.PI / 4}
          armSpread={0.2}
        />
      </group>
      <group position={[scale * 0.1, scale * 0.1, scale * 0.2]} rotation={[0, 0, -Math.PI / 6]}>
        <DetailedArm 
          position={[0, 0, 0]} 
          scale={scale * 0.8} 
          color="#2c3e50"
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          side="right"
          upperArmAngle={Math.PI / 3}
          forearmAngle={-Math.PI / 4}
          armSpread={0.2}
        />
      </group>
      
      {/* Руль перед водителем */}
      <Cylinder args={[scale * 0.18, scale * 0.18, scale * 0.03, 16]} rotation={[0, 0, 0]} position={[0, scale * 0.18, scale * 0.25]}>
        {createMaterial('#1a1a1a', emissive, emissiveIntensity)}
      </Cylinder>
      {/* Спица руля (горизонтальная) */}
      <Box args={[scale * 0.36, scale * 0.02, scale * 0.01]} position={[0, scale * 0.18, scale * 0.255]}>
        {createMaterial('#2c3e50', emissive, emissiveIntensity)}
      </Box>
      {/* Спица руля (вертикальная) */}
      <Box args={[scale * 0.02, scale * 0.36, scale * 0.01]} position={[0, scale * 0.18, scale * 0.255]}>
        {createMaterial('#2c3e50', emissive, emissiveIntensity)}
      </Box>
      
      {/* Брюки */}
      <Box args={[scale * 0.2, scale * 0.2, scale * 0.15]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#3498db', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - поза водителя, ноги слегка согнуты */}
      <DetailedLeg 
        position={[-scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#3498db"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={0.1}
        shinAngle={-0.15}
      />
      <DetailedLeg 
        position={[scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#3498db"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0.1}
        shinAngle={-0.15}
      />
    </group>
  );
}

// Рабочий - рабочая жилетка, каска
export function Worker({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Каска */}
      <Cone args={[scale * 0.18, scale * 0.1, 8]} position={[0, scale * 0.4, 0]}>
        {createMaterial('#ffd700', emissive, emissiveIntensity)}
      </Cone>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      <Beard scale={scale} style="medium" emissive={emissive} emissiveIntensity={emissiveIntensity} />
      <Mustache scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Одежда - разделенная */}
      {/* Рубашка (базовый слой) */}
      <Box args={[scale * 0.2, scale * 0.35, scale * 0.14]} position={[0, scale * 0.05, 0]}>
        {createMaterial('#2c3e50', emissive, emissiveIntensity)}
      </Box>
      {/* Рабочая жилетка (оранжевая, поверх) */}
      <Box args={[scale * 0.23, scale * 0.38, scale * 0.16]} position={[0, scale * 0.05, 0]}>
        {createMaterial('#ff6b35', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки - рабочая поза: одна рука свободна, другая с инструментом */}
      <DetailedArm 
        position={[-scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#ff6b35"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        upperArmAngle={-Math.PI / 4}
        forearmAngle={-Math.PI / 3}
        armSpread={0.18}
      />
      <DetailedArm 
        position={[scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#ff6b35"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        upperArmAngle={Math.PI / 4}
        forearmAngle={Math.PI / 3}
        armSpread={0.2}
      />
      
      {/* Рабочие брюки */}
      <Box args={[scale * 0.2, scale * 0.2, scale * 0.15]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#2c3e50', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - устойчивая рабочая поза, ноги широко расставлены */}
      <DetailedLeg 
        position={[-scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#2c3e50"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={-0.08}
        shinAngle={0.1}
        legSpread={0.1}
      />
      <DetailedLeg 
        position={[scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#2c3e50"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0.08}
        shinAngle={-0.1}
        legSpread={0.1}
      />
    </group>
  );
}

// Инженер - чертежи, инструменты
export function Engineer({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      <Glasses scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      <Beard scale={scale} style="short" emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Одежда */}
      {/* Рубашка */}
      <Box args={[scale * 0.2, scale * 0.35, scale * 0.14]} position={[0, scale * 0.05, 0]}>
        {createMaterial('#ffffff', emissive, emissiveIntensity)}
      </Box>
      {/* Жилет инженера */}
      <Box args={[scale * 0.19, scale * 0.3, scale * 0.145]} position={[0, scale * 0.1, 0]}>
        {createMaterial('#7f8c8d', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки - поза инженера: левая свободна, правая с чертежом */}
      <DetailedArm 
        position={[-scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#7f8c8d"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        upperArmAngle={-Math.PI / 5}
        forearmAngle={-Math.PI / 4}
        armSpread={0.17}
      />
      {/* Правая рука с чертежом - вытянута вперед */}
      <group position={[scale * 0.1, scale * 0.1, 0]}>
        <DetailedArm 
          position={[0, 0, 0]} 
          scale={scale} 
          color="#7f8c8d"
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          side="right"
          upperArmAngle={Math.PI / 3}
          forearmAngle={Math.PI / 4}
          armSpread={0.22}
        />
        {/* Чертеж в руке */}
        <Box args={[scale * 0.2, scale * 0.25, scale * 0.02]} position={[scale * 0.5, scale * 0.2, 0]} rotation={[0, 0, Math.PI / 8]}>
          {createMaterial('#ffffff', emissive, emissiveIntensity)}
        </Box>
      </group>
      
      {/* Брюки */}
      <Box args={[scale * 0.2, scale * 0.2, scale * 0.15]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#7f8c8d', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - профессиональная стойка */}
      <DetailedLeg 
        position={[-scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#7f8c8d"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={-0.03}
        shinAngle={0.05}
      />
      <DetailedLeg 
        position={[scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#7f8c8d"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0.03}
        shinAngle={-0.05}
      />
    </group>
  );
}

// Врач - белый халат
export function Doctor({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Одежда - разделенная */}
      {/* Одежда под халатом */}
      <Box args={[scale * 0.2, scale * 0.35, scale * 0.14]} position={[0, scale * 0.05, 0]}>
        {createMaterial('#34495e', emissive, emissiveIntensity)}
      </Box>
      {/* Белый халат (верхняя часть) */}
      <Box args={[scale * 0.24, scale * 0.45, scale * 0.18]} position={[0, scale * 0.08, 0]}>
        {createMaterial('#ffffff', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки - поза врача: обе руки перед собой для осмотра */}
      <DetailedArm 
        position={[-scale * 0.12, scale * 0.1, 0]} 
        scale={scale} 
        color="#ffffff"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        upperArmAngle={Math.PI / 4}
        forearmAngle={Math.PI / 2}
        armSpread={0.15}
      />
      <DetailedArm 
        position={[scale * 0.12, scale * 0.1, 0]} 
        scale={scale} 
        color="#ffffff"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        upperArmAngle={Math.PI / 4}
        forearmAngle={Math.PI / 2}
        armSpread={0.15}
      />
      
      {/* Брюки под халатом */}
      <Box args={[scale * 0.22, scale * 0.2, scale * 0.16]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#34495e', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - профессиональная стойка врача */}
      <DetailedLeg 
        position={[-scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#34495e"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={0}
        shinAngle={0}
      />
      <DetailedLeg 
        position={[scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#34495e"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0}
        shinAngle={0}
      />
    </group>
  );
}

// Повар - колпак, фартук
export function Chef({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Колпак повара */}
      <Cylinder args={[scale * 0.18, scale * 0.12, scale * 0.2, 8]} position={[0, scale * 0.45, 0]}>
        {createMaterial('#ffffff', emissive, emissiveIntensity)}
      </Cylinder>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      <Mustache scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Одежда - разделенная */}
      {/* Рубашка/футболка */}
      <Box args={[scale * 0.2, scale * 0.35, scale * 0.14]} position={[0, scale * 0.05, 0]}>
        {createMaterial('#e74c3c', emissive, emissiveIntensity)}
      </Box>
      {/* Фартук (отдельный, поверх) */}
      <Box args={[scale * 0.19, scale * 0.35, scale * 0.16]} position={[0, scale * 0.02, 0]}>
        {createMaterial('#ffffff', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки - поза повара: одна рука с ложкой/половником */}
      <DetailedArm 
        position={[-scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#e74c3c"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        upperArmAngle={-Math.PI / 5}
        forearmAngle={-Math.PI / 3}
        armSpread={0.17}
      />
      <DetailedArm 
        position={[scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#e74c3c"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        upperArmAngle={Math.PI / 3}
        forearmAngle={Math.PI / 2}
        armSpread={0.2}
      />
      
      {/* Брюки */}
      <Box args={[scale * 0.2, scale * 0.2, scale * 0.15]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#2c3e50', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - стойка повара, ноги слегка расставлены */}
      <DetailedLeg 
        position={[-scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#2c3e50"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={-0.05}
        shinAngle={0.08}
      />
      <DetailedLeg 
        position={[scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#2c3e50"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0.05}
        shinAngle={-0.08}
      />
    </group>
  );
}

// Учитель - указка, книги
export function Teacher({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      <Glasses scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Одежда */}
      {/* Рубашка */}
      <Box args={[scale * 0.2, scale * 0.35, scale * 0.14]} position={[0, scale * 0.05, 0]}>
        {createMaterial('#ffffff', emissive, emissiveIntensity)}
      </Box>
      {/* Кардиган/пиджак */}
      <Box args={[scale * 0.22, scale * 0.25, scale * 0.15]} position={[0, scale * 0.125, 0]}>
        {createMaterial('#9b59b6', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки - поза учителя: одна с книгами, другая с указкой */}
      <group position={[-scale * 0.1, scale * 0.1, 0]}>
        <DetailedArm 
          position={[0, 0, 0]} 
          scale={scale} 
          color="#9b59b6"
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          side="left"
          upperArmAngle={-Math.PI / 4}
          forearmAngle={-Math.PI / 3}
          armSpread={0.16}
        />
        {/* Книги в руке */}
        <Box args={[scale * 0.12, scale * 0.2, scale * 0.02]} position={[-scale * 0.4, scale * 0.05, 0]} rotation={[0, 0, -Math.PI / 6]}>
          {createMaterial('#8b4513', emissive, emissiveIntensity)}
        </Box>
      </group>
      <group position={[scale * 0.1, scale * 0.1, 0]}>
        <DetailedArm 
          position={[0, 0, 0]} 
          scale={scale} 
          color="#9b59b6"
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          side="right"
          upperArmAngle={Math.PI / 2}
          forearmAngle={Math.PI / 3}
          armSpread={0.22}
        />
        {/* Указка */}
        <Box args={[scale * 0.02, scale * 0.3, scale * 0.02]} position={[scale * 0.45, scale * 0.25, 0]} rotation={[0, 0, Math.PI / 6]}>
          {createMaterial('#1a1a1a', emissive, emissiveIntensity)}
        </Box>
      </group>
      
      {/* Брюки */}
      <Box args={[scale * 0.2, scale * 0.2, scale * 0.15]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#9b59b6', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - стойка учителя */}
      <DetailedLeg 
        position={[-scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#9b59b6"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={0}
        shinAngle={0}
      />
      <DetailedLeg 
        position={[scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#9b59b6"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0}
        shinAngle={0}
      />
    </group>
  );
}

// Охранник - форма
export function Security({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      <Mustache scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Одежда - форма */}
      {/* Рубашка */}
      <Box args={[scale * 0.2, scale * 0.35, scale * 0.14]} position={[0, scale * 0.05, 0]}>
        {createMaterial('#ffffff', emissive, emissiveIntensity)}
      </Box>
      {/* Форма (куртка) */}
      <Box args={[scale * 0.22, scale * 0.25, scale * 0.15]} position={[0, scale * 0.125, 0]}>
        {createMaterial('#1a237e', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки - стойка охранника: руки по швам */}
      <DetailedArm 
        position={[-scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#1a237e"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        upperArmAngle={-Math.PI / 6}
        forearmAngle={-Math.PI / 3}
        armSpread={0.18}
      />
      <DetailedArm 
        position={[scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#1a237e"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        upperArmAngle={-Math.PI / 6}
        forearmAngle={-Math.PI / 3}
        armSpread={0.18}
      />
      
      {/* Брюки */}
      <Box args={[scale * 0.2, scale * 0.2, scale * 0.15]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#1a237e', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - стойка охранника: ноги широко расставлены */}
      <DetailedLeg 
        position={[-scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#1a237e"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={-0.1}
        shinAngle={0.15}
        legSpread={0.12}
      />
      <DetailedLeg 
        position={[scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#1a237e"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0.1}
        shinAngle={-0.15}
        legSpread={0.12}
      />
    </group>
  );
}

// Продавец - униформа
export function Salesperson({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Одежда - униформа */}
      {/* Верхняя часть униформы */}
      <Box args={[scale * 0.22, scale * 0.4, scale * 0.15]} position={[0, scale * 0.05, 0]}>
        {createMaterial('#16a085', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки - открытая поза продавца: одна рука жестикулирует */}
      <DetailedArm 
        position={[-scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#16a085"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        upperArmAngle={-Math.PI / 5}
        forearmAngle={-Math.PI / 3}
        armSpread={0.17}
      />
      <DetailedArm 
        position={[scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#16a085"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        upperArmAngle={Math.PI / 2}
        forearmAngle={Math.PI / 4}
        armSpread={0.22}
      />
      
      {/* Нижняя часть униформы (брюки) */}
      <Box args={[scale * 0.2, scale * 0.2, scale * 0.15]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#16a085', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - открытая поза */}
      <DetailedLeg 
        position={[-scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#16a085"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={-0.04}
        shinAngle={0.06}
      />
      <DetailedLeg 
        position={[scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#16a085"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0.04}
        shinAngle={-0.06}
      />
    </group>
  );
}

// IT-специалист - сидит за компьютером
export function ITSpecialist({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Человек сидит */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.25, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} position={[0, scale * 0.25, 0]} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      <Glasses scale={scale} position={[0, scale * 0.25, 0]} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      <Beard scale={scale} position={[0, scale * 0.25, 0]} style="medium" emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Одежда */}
      {/* Футболка/рубашка */}
      <Box args={[scale * 0.2, scale * 0.3, scale * 0.14]} position={[0, scale * 0.05, 0]}>
        {createMaterial('#27ae60', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки на клавиатуре */}
      <group position={[-scale * 0.1, scale * 0.08, scale * 0.2]} rotation={[0, 0, Math.PI / 4]}>
        <DetailedArm 
          position={[0, 0, 0]} 
          scale={scale * 0.7} 
          color="#27ae60"
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          side="left"
        />
      </group>
      <group position={[scale * 0.1, scale * 0.08, scale * 0.2]} rotation={[0, 0, -Math.PI / 4]}>
        <DetailedArm 
          position={[0, 0, 0]} 
          scale={scale * 0.7} 
          color="#27ae60"
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          side="right"
        />
      </group>
      
      {/* Джинсы/брюки */}
      <Box args={[scale * 0.2, scale * 0.2, scale * 0.15]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#1a237e', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - поза сидя за компьютером */}
      <DetailedLeg 
        position={[-scale * 0.06, -scale * 0.05, 0]} 
        scale={scale * 0.85} 
        color="#1a237e"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={0.15}
        shinAngle={-0.2}
      />
      <DetailedLeg 
        position={[scale * 0.06, -scale * 0.05, 0]} 
        scale={scale * 0.85} 
        color="#1a237e"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0.15}
        shinAngle={-0.2}
      />
      
      {/* Стул */}
      <Box args={[scale * 0.3, scale * 0.05, scale * 0.25]} position={[0, -scale * 0.3, 0]}>
        {createMaterial('#8b4513', emissive, emissiveIntensity)}
      </Box>
      <Box args={[scale * 0.05, scale * 0.3, scale * 0.05]} position={[-scale * 0.12, -scale * 0.15, -scale * 0.1]}>
        {createMaterial('#8b4513', emissive, emissiveIntensity)}
      </Box>
      <Box args={[scale * 0.05, scale * 0.3, scale * 0.05]} position={[scale * 0.12, -scale * 0.15, -scale * 0.1]}>
        {createMaterial('#8b4513', emissive, emissiveIntensity)}
      </Box>
      <Box args={[scale * 0.05, scale * 0.25, scale * 0.05]} position={[-scale * 0.12, -scale * 0.125, scale * 0.1]}>
        {createMaterial('#8b4513', emissive, emissiveIntensity)}
      </Box>
      <Box args={[scale * 0.05, scale * 0.25, scale * 0.05]} position={[scale * 0.12, -scale * 0.125, scale * 0.1]}>
        {createMaterial('#8b4513', emissive, emissiveIntensity)}
      </Box>
      <Box args={[scale * 0.3, scale * 0.25, scale * 0.05]} position={[0, -scale * 0.075, -scale * 0.125]}>
        {createMaterial('#8b4513', emissive, emissiveIntensity)}
      </Box>
      
      {/* Компьютер перед ним */}
      {/* Монитор */}
      <Box args={[scale * 0.45, scale * 0.35, scale * 0.05]} position={[0, scale * 0.2, scale * 0.3]}>
        {createMaterial('#34495e', emissive, emissiveIntensity, 0.5, 0.3)}
      </Box>
      {/* Подставка монитора */}
      <Box args={[scale * 0.12, scale * 0.06, scale * 0.06]} position={[0, scale * 0.08, scale * 0.3]}>
        {createMaterial('#34495e', emissive, emissiveIntensity, 0.5, 0.3)}
      </Box>
      {/* Клавиатура */}
      <Box args={[scale * 0.35, scale * 0.04, scale * 0.12]} position={[0, scale * 0.05, scale * 0.25]}>
        {createMaterial('#34495e', emissive, emissiveIntensity, 0.5, 0.3)}
      </Box>
    </group>
  );
}

// Актер - поет с микрофоном
export function Actor({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      <Mustache scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Одежда - театральный костюм */}
      {/* Верхняя часть костюма */}
      <Box args={[scale * 0.24, scale * 0.45, scale * 0.18]} position={[0, scale * 0.08, 0]}>
        {createMaterial('#e91e63', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки - выразительная поза актера: левая поднята, правая с микрофоном */}
      <DetailedArm 
        position={[-scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#e91e63"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        upperArmAngle={Math.PI / 2}
        forearmAngle={Math.PI / 3}
        armSpread={0.22}
      />
      {/* Правая рука держит микрофон */}
      <group position={[scale * 0.1, scale * 0.15, 0]}>
        <DetailedArm 
          position={[0, 0, 0]} 
          scale={scale * 0.8} 
          color="#e91e63"
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          side="right"
          upperArmAngle={Math.PI / 3}
          forearmAngle={Math.PI / 4}
          armSpread={0.2}
        />
        {/* Микрофон */}
        {/* Рукоятка микрофона */}
        <Cylinder args={[scale * 0.03, scale * 0.03, scale * 0.15, 8]} position={[scale * 0.25, scale * 0.2, 0]} rotation={[Math.PI / 8, 0, 0]}>
          {createMaterial('#1a1a1a', emissive, emissiveIntensity)}
        </Cylinder>
        {/* Головка микрофона */}
        <Cylinder args={[scale * 0.06, scale * 0.06, scale * 0.05, 16]} position={[scale * 0.27, scale * 0.28, 0]} rotation={[Math.PI / 8, 0, 0]}>
          {createMaterial('#2c3e50', emissive, emissiveIntensity, 0.7, 0.2)}
        </Cylinder>
        {/* Сетка микрофона */}
        <Sphere args={[scale * 0.055, 16, 16]} position={[scale * 0.275, scale * 0.29, 0]}>
          {createMaterial('#34495e', emissive, emissiveIntensity, 0.5, 0.4)}
        </Sphere>
      </group>
      
      {/* Нижняя часть костюма */}
      <Box args={[scale * 0.22, scale * 0.2, scale * 0.18]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#e91e63', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - выразительная поза актера */}
      <DetailedLeg 
        position={[-scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#e91e63"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={-0.06}
        shinAngle={0.1}
      />
      <DetailedLeg 
        position={[scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#e91e63"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0.06}
        shinAngle={-0.1}
      />
    </group>
  );
}

// Уборщик - швабра, ведро
export function Cleaner({ size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const scale = Math.max(sx, sy, sz);
  
  return (
    <group onClick={onClick} onPointerOver={onPointerOver} onPointerOut={onPointerOut} userData={userData}>
      {/* Голова */}
      <Sphere args={[scale * 0.15, 16, 16]} position={[0, scale * 0.35, 0]}>
        {createMaterial('#fdbcb4', emissive, emissiveIntensity)}
      </Sphere>
      
      {/* Детали лица */}
      <FaceDetails scale={scale} emissive={emissive} emissiveIntensity={emissiveIntensity} />
      
      {/* Одежда - униформа */}
      {/* Верхняя часть униформы */}
      <Box args={[scale * 0.22, scale * 0.4, scale * 0.15]} position={[0, scale * 0.05, 0]}>
        {createMaterial('#95a5a6', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные руки - рабочая поза уборщика: одна со шваброй */}
      <DetailedArm 
        position={[-scale * 0.1, scale * 0.1, 0]} 
        scale={scale} 
        color="#95a5a6"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        upperArmAngle={-Math.PI / 5}
        forearmAngle={-Math.PI / 3}
        armSpread={0.17}
      />
      {/* Правая рука со шваброй - вытянута вперед */}
      <group position={[scale * 0.1, scale * 0.1, 0]}>
        <DetailedArm 
          position={[0, 0, 0]} 
          scale={scale} 
          color="#95a5a6"
          emissive={emissive}
          emissiveIntensity={emissiveIntensity}
          side="right"
          upperArmAngle={Math.PI / 4}
          forearmAngle={Math.PI / 3}
          armSpread={0.2}
        />
        {/* Швабра */}
        <Box args={[scale * 0.02, scale * 0.4, scale * 0.02]} position={[scale * 0.5, scale * 0.25, 0]} rotation={[0, 0, Math.PI / 6]}>
          {createMaterial('#8b4513', emissive, emissiveIntensity)}
        </Box>
      </group>
      
      {/* Ведро */}
      <Cylinder args={[scale * 0.1, scale * 0.1, scale * 0.12, 16]} position={[-scale * 0.25, -scale * 0.15, 0]}>
        {createMaterial('#3498db', emissive, emissiveIntensity)}
      </Cylinder>
      
      {/* Нижняя часть униформы */}
      <Box args={[scale * 0.2, scale * 0.2, scale * 0.15]} position={[0, -scale * 0.15, 0]}>
        {createMaterial('#95a5a6', emissive, emissiveIntensity)}
      </Box>
      
      {/* Детализированные ноги - рабочая поза уборщика, ноги в рабочем положении */}
      <DetailedLeg 
        position={[-scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#95a5a6"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="left"
        thighAngle={-0.06}
        shinAngle={0.1}
      />
      <DetailedLeg 
        position={[scale * 0.08, -scale * 0.05, 0]} 
        scale={scale} 
        color="#95a5a6"
        emissive={emissive}
        emissiveIntensity={emissiveIntensity}
        side="right"
        thighAngle={0.06}
        shinAngle={-0.1}
      />
    </group>
  );
}

