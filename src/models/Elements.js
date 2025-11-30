// Базовый класс для всех элементов блок-схемы
export class Element {
  constructor(data = {}) {
    this.name = data.name || '';
    this.description = data.description || '';
  }

  // Метод для валидации данных
  validate() {
    if (!this.name || this.name.trim() === '') {
      throw new Error('Name is required');
    }
    return true;
  }

  // Метод для получения данных для сохранения
  toJSON() {
    return {
      name: this.name,
      description: this.description
    };
  }
}

// Класс сцены
export class SceneElement extends Element {
  constructor(data = {}) {
    super(data);
    this.background = data.background || '#000000';
    this.showGrid = data.showGrid !== undefined ? data.showGrid : true;
    // Дополнительные настройки сцены можно добавить здесь
  }

  toJSON() {
    return {
      ...super.toJSON(),
      background: this.background,
      showGrid: this.showGrid
    };
  }
}

// Класс воркера (бывшая сущность)
export class WorkerElement extends Element {
  constructor(data = {}) {
    super(data);
    this.type = data.type || 'worker'; // тип персонажа (generalDirector, car, motorcycle и т.д.)
    this.color = data.color || '#3b82f6';
    this.emissive = data.emissive || '#000000'; // цвет сферы
  }

  toJSON() {
    return {
      ...super.toJSON(),
      type: this.type,
      color: this.color,
      emissive: this.emissive
    };
  }
}

// Класс простого блока
export class BlockElement extends Element {
  constructor(data = {}) {
    super(data);
    this.color = data.color || '#3b82f6';
  }

  toJSON() {
    return {
      ...super.toJSON(),
      color: this.color
    };
  }
}

// Фабрика для создания элементов
export class ElementFactory {
  static create(elementType, data = {}) {
    switch (elementType) {
      case 'scene':
        return new SceneElement(data);
      case 'worker':
        return new WorkerElement(data);
      case 'block':
        return new BlockElement(data);
      default:
        throw new Error(`Unknown element type: ${elementType}`);
    }
  }

  static getElementType(element) {
    // Определяем тип элемента по его свойствам
    if (element.background !== undefined || element.showGrid !== undefined) {
      return 'scene';
    }
    if (element.type && element.type !== 'block') {
      return 'worker';
    }
    if (element.type === 'block' || (!element.type && element.color)) {
      return 'block';
    }
    return 'worker'; // По умолчанию считаем воркером
  }
}

