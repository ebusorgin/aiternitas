import { useMemo } from 'react';
import { Box, Sphere, Cylinder, Octahedron, Cone } from '@react-three/drei';
import * as THREE from 'three';
import {
  SchematicHuman,
  SchematicComputer,
  SchematicCar,
  SchematicHumanWithPapers,
  SchematicHumanAtComputer
} from './SchematicModels';
import {
  GeneralDirector,
  Manager,
  Accountant,
  Lawyer,
  Driver,
  Worker,
  Engineer,
  Doctor,
  Chef,
  Teacher,
  Security,
  Salesperson,
  ITSpecialist,
  Actor,
  Cleaner
} from './WorkerModels';
import {
  Car,
  Ship,
  Airplane,
  Train,
  Helicopter,
  Bus,
  Truck,
  Motorcycle,
  Bicycle,
  Forklift
} from './TechniqueModels';
import {
  Consultation,
  Repair,
  Delivery,
  Cleaning,
  SecurityService,
  Training,
  MedicalService,
  Catering,
  Transport,
  Entertainment
} from './ServiceModels';

// Доступные типы сущностей (иерархия работников)
export const ENTITY_TYPES = {
  // Профессии (Professions)
  generalDirector: { label: 'General Director', icon: '👔', category: 'professions' },
  manager: { label: 'Manager', icon: '💼', category: 'professions' },
  accountant: { label: 'Accountant', icon: '📊', category: 'professions' },
  lawyer: { label: 'Lawyer', icon: '⚖️', category: 'professions' },
  driver: { label: 'Driver', icon: '🚗', category: 'professions' },
  worker: { label: 'Worker', icon: '👷', category: 'professions' },
  engineer: { label: 'Engineer', icon: '🔧', category: 'professions' },
  doctor: { label: 'Doctor', icon: '👨‍⚕️', category: 'professions' },
  chef: { label: 'Chef', icon: '👨‍🍳', category: 'professions' },
  teacher: { label: 'Teacher', icon: '👨‍🏫', category: 'professions' },
  security: { label: 'Security', icon: '🛡️', category: 'professions' },
  salesperson: { label: 'Salesperson', icon: '💼', category: 'professions' },
  itSpecialist: { label: 'IT Specialist', icon: '💻', category: 'professions' },
  actor: { label: 'Actor', icon: '🎭', category: 'professions' },
  cleaner: { label: 'Cleaner', icon: '🧹', category: 'professions' },
  
  // Техника (Technique)
  car: { label: 'Car', icon: '🚗', category: 'technique' },
  ship: { label: 'Ship', icon: '🚢', category: 'technique' },
  airplane: { label: 'Airplane', icon: '✈️', category: 'technique' },
  train: { label: 'Train', icon: '🚂', category: 'technique' },
  helicopter: { label: 'Helicopter', icon: '🚁', category: 'technique' },
  bus: { label: 'Bus', icon: '🚌', category: 'technique' },
  truck: { label: 'Truck', icon: '🚚', category: 'technique' },
  motorcycle: { label: 'Motorcycle', icon: '🏍️', category: 'technique' },
  bicycle: { label: 'Bicycle', icon: '🚲', category: 'technique' },
  forklift: { label: 'Forklift', icon: '🚜', category: 'technique' },
  
  // Услуги (Services)
  consultation: { label: 'Consultation', icon: '💬', category: 'services' },
  repair: { label: 'Repair', icon: '🔧', category: 'services' },
  delivery: { label: 'Delivery', icon: '📦', category: 'services' },
  cleaning: { label: 'Cleaning', icon: '🧹', category: 'services' },
  securityService: { label: 'Security Service', icon: '🛡️', category: 'services' },
  training: { label: 'Training', icon: '📚', category: 'services' },
  medicalService: { label: 'Medical Service', icon: '🏥', category: 'services' },
  catering: { label: 'Catering', icon: '🍽️', category: 'services' },
  transport: { label: 'Transport', icon: '🚕', category: 'services' },
  entertainment: { label: 'Entertainment', icon: '🎪', category: 'services' },
  // Старые типы (для обратной совместимости)
  box: { label: 'Box', icon: '📦', category: 'other' },
  human: { label: 'Human', icon: '👤', category: 'other' },
  automobile: { label: 'Automobile', icon: '🚗', category: 'other' },
  computer: { label: 'Computer', icon: '💻', category: 'other' },
  cashier: { label: 'Cashier', icon: '💰', category: 'other' },
  humanWithPapers: { label: 'Human with Papers', icon: '📋', category: 'other' },
  humanAtComputer: { label: 'Human at Computer', icon: '👨‍💻', category: 'other' },
  video: { label: 'Video', icon: '📹', category: 'other' },
  document: { label: 'Document', icon: '📄', category: 'other' },
  database: { label: 'Database', icon: '🗄️', category: 'other' },
  server: { label: 'Server', icon: '🖥️', category: 'other' },
  user: { label: 'User', icon: '👥', category: 'other' }
};

// Категории для модального окна
export const ENTITY_CATEGORIES = {
  professions: 'Professions',
  technique: 'Technique',
  services: 'Services'
};

function EntityShape({ type = 'box', size = [1, 1, 1], color, emissive, emissiveIntensity, onClick, onPointerOver, onPointerOut, userData }) {
  const [sx, sy, sz] = size;
  const maxSize = Math.max(sx, sy, sz);
  
  // Определяем компонент в зависимости от типа
  const shapeProps = {
    size: [sx, sy, sz],
    color,
    emissive,
    emissiveIntensity,
    onClick,
    onPointerOver,
    onPointerOut,
    userData
  };

  // Используем схематические модели для более реалистичных типов
  switch (type) {
    // Иерархия работников
    case 'generalDirector':
      return <GeneralDirector {...shapeProps} />;
    case 'manager':
      return <Manager {...shapeProps} />;
    case 'accountant':
      return <Accountant {...shapeProps} />;
    case 'lawyer':
      return <Lawyer {...shapeProps} />;
    case 'driver':
      return <Driver {...shapeProps} />;
    case 'worker':
      return <Worker {...shapeProps} />;
    case 'engineer':
      return <Engineer {...shapeProps} />;
    case 'doctor':
      return <Doctor {...shapeProps} />;
    case 'chef':
      return <Chef {...shapeProps} />;
    case 'teacher':
      return <Teacher {...shapeProps} />;
    case 'security':
      return <Security {...shapeProps} />;
    case 'salesperson':
      return <Salesperson {...shapeProps} />;
    case 'itSpecialist':
      return <ITSpecialist {...shapeProps} />;
    case 'actor':
      return <Actor {...shapeProps} />;
    case 'cleaner':
      return <Cleaner {...shapeProps} />;
    
    // Техника
    case 'car':
      return <Car {...shapeProps} />;
    case 'ship':
      return <Ship {...shapeProps} />;
    case 'airplane':
      return <Airplane {...shapeProps} />;
    case 'train':
      return <Train {...shapeProps} />;
    case 'helicopter':
      return <Helicopter {...shapeProps} />;
    case 'bus':
      return <Bus {...shapeProps} />;
    case 'truck':
      return <Truck {...shapeProps} />;
    case 'motorcycle':
      return <Motorcycle {...shapeProps} />;
    case 'bicycle':
      return <Bicycle {...shapeProps} />;
    case 'forklift':
      return <Forklift {...shapeProps} />;
    
    // Услуги
    case 'consultation':
      return <Consultation {...shapeProps} />;
    case 'repair':
      return <Repair {...shapeProps} />;
    case 'delivery':
      return <Delivery {...shapeProps} />;
    case 'cleaning':
      return <Cleaning {...shapeProps} />;
    case 'securityService':
      return <SecurityService {...shapeProps} />;
    case 'training':
      return <Training {...shapeProps} />;
    case 'medicalService':
      return <MedicalService {...shapeProps} />;
    case 'catering':
      return <Catering {...shapeProps} />;
    case 'transport':
      return <Transport {...shapeProps} />;
    case 'entertainment':
      return <Entertainment {...shapeProps} />;
    
    // Старые типы
    case 'human':
      return <SchematicHuman {...shapeProps} />;
    case 'automobile':
      return <SchematicCar {...shapeProps} />;
    case 'computer':
      return <SchematicComputer {...shapeProps} />;
    case 'humanWithPapers':
      return <SchematicHumanWithPapers {...shapeProps} />;
    case 'humanAtComputer':
      return <SchematicHumanAtComputer {...shapeProps} />;
    
    case 'cashier':
      // Конус для кассира
      return (
        <Cone args={[maxSize * 0.5, maxSize * 0.8, 8]} {...{ onClick, onPointerOver, onPointerOut, userData }}>
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
            metalness={0.3}
            roughness={0.7}
          />
        </Cone>
      );
    
    case 'video':
      // Плоский прямоугольник для видео
      return (
        <Box args={[sx * 1.5, sy * 0.3, sz * 1.0]} {...{ onClick, onPointerOver, onPointerOut, userData }}>
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
            metalness={0.3}
            roughness={0.7}
          />
        </Box>
      );
    
    case 'document':
      // Тонкий прямоугольник для документа
      return (
        <Box args={[sx * 0.8, sy * 0.1, sz * 1.0]} {...{ onClick, onPointerOver, onPointerOut, userData }}>
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
            metalness={0.3}
            roughness={0.7}
          />
        </Box>
      );
    
    case 'database':
      // Цилиндр для базы данных (стоящий)
      return (
        <Cylinder args={[maxSize * 0.5, maxSize * 0.5, maxSize * 1.2, 16]} {...{ onClick, onPointerOver, onPointerOut, userData }}>
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
            metalness={0.3}
            roughness={0.7}
          />
        </Cylinder>
      );
    
    case 'server':
      // Высокий прямоугольник для сервера
      return (
        <Box args={[sx * 0.8, sy * 1.5, sz * 0.8]} {...{ onClick, onPointerOver, onPointerOut, userData }}>
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
            metalness={0.3}
            roughness={0.7}
          />
        </Box>
      );
    
    case 'user':
      // Сфера для пользователя
      return (
        <Sphere args={[maxSize * 0.45, 32, 32]} {...{ onClick, onPointerOver, onPointerOut, userData }}>
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
            metalness={0.3}
            roughness={0.7}
          />
        </Sphere>
      );
    
    case 'box':
    default:
      // Стандартный куб
      return (
        <Box args={[sx, sy, sz]} {...{ onClick, onPointerOver, onPointerOut, userData }}>
          <meshStandardMaterial
            color={color}
            emissive={emissive}
            emissiveIntensity={emissiveIntensity}
            metalness={0.3}
            roughness={0.7}
          />
        </Box>
      );
  }
}

export default EntityShape;

