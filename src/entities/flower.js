export class Flower {
  constructor() {
    this.pollen = 100;
  }

  heal(player) {
    console.log('Healing player', player.name);
  }
}
