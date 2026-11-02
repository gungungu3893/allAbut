// ===== 어깨 펫 =====
// - 캐릭터 오른쪽 어깨 위에 앉아 있어요
// - 캐릭터 방향이 바뀌면 같은 방향을 보고, 위치도 어깨에 맞게 이동
//   (뒤돌거나 왼쪽을 보면 오른쪽 어깨가 뒤쪽이라 머리 뒤로 살짝 가려져요)
// - 걸을 때 걸음에 맞춰 위아래로 살짝 흔들림
// - 가만히 있으면 5~10초마다 작은 동작 (꼬리, 날개, 볼, 귀, 반짝임)

// 방향별 어깨 위치 (캐릭터 발 기준 픽셀) + 앞(front)/뒤(behind)
var PET_SPOTS = {
  down:  { x: -15, y: -26, front: true },   // 앞모습: 캐릭터의 오른쪽 어깨 = 화면 왼쪽
  up:    { x: 15,  y: -27, front: false },  // 뒷모습: 화면 오른쪽, 머리 뒤로 살짝 가려짐
  left:  { x: 13,  y: -28, front: false },  // 왼쪽을 볼 때: 오른쪽 어깨가 뒤쪽 (머리 뒤로 살짝 보임)
  right: { x: -3,  y: -26, front: true }    // 오른쪽을 볼 때: 오른쪽 어깨가 앞쪽
};

class Pet {
  constructor(scene, petId) {
    this.scene = scene;
    this.sprite = null;
    this.petId = null;
    this.nextAction = 5 + Math.random() * 5;
    this.actionUntil = 0;
    this.setPet(petId);
  }

  // 펫 바꾸기 ('pet_none' 이나 없는 펫이면 숨김)
  setPet(petId) {
    if (petId === this.petId) return;
    this.petId = petId;
    if (this.sprite) { this.sprite.destroy(); this.sprite = null; }
    var key = ASSETS.pets[petId];
    if (key && this.scene.textures.exists(key)) {
      this.sprite = this.scene.add.image(0, 0, key, 0).setOrigin(0.5, 1);
    }
  }

  get active() {
    return !!this.sprite;
  }

  // 펫 머리 꼭대기 y (이름표가 겹치지 않게 쓰는 값). 펫이 없으면 null
  topY(feetY, dir) {
    if (!this.sprite) return null;
    return feetY + (PET_SPOTS[dir] || PET_SPOTS.down).y - PET_SIZE - 1;
  }

  // 매 프레임: owner = { x, y(발), dir, moving, depth }, time = 초
  update(owner, time) {
    if (!this.sprite) return;
    var spot = PET_SPOTS[owner.dir] || PET_SPOTS.down;
    var row = CHAR_DIRS.indexOf(owner.dir);

    // 걸을 때 위아래로 살짝
    var bob = owner.moving ? (Math.sin(time * 18) > 0 ? -1 : 0) : 0;

    // 가만히 있을 때 가끔 작은 동작 (동작 중에는 0.2초마다 번갈아)
    var acting = false;
    if (owner.moving) {
      this.actionUntil = 0;
      if (time > this.nextAction) this.nextAction = time + 5 + Math.random() * 5;
    } else {
      if (time > this.nextAction) {
        this.actionUntil = time + 1.0;
        this.nextAction = time + 5 + Math.random() * 5;
      }
      acting = time < this.actionUntil && Math.floor(time * 5) % 2 === 0;
    }

    this.sprite.setFrame(row * 2 + (acting ? 1 : 0));
    this.sprite.setPosition(Math.round(owner.x + spot.x), Math.round(owner.y + spot.y + bob));
    this.sprite.setDepth(owner.depth + (spot.front ? 0.5 : -0.5));
  }

  setVisible(on) {
    if (this.sprite) this.sprite.setVisible(on);
  }

  destroy() {
    if (this.sprite) this.sprite.destroy();
    this.sprite = null;
  }
}
