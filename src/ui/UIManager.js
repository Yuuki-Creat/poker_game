import { TableView } from './TableView.js';
import { PlayerView } from './PlayerView.js';
import { NPCView } from './NPCView.js';
import { ControlView } from './ControlView.js';
import { ModalView } from './ModalView.js';

/**
 * Storeの状態更新を購読し、全てのViewコンポーネントへ一括描画を指示する統括クラス
 */
export class UIManager {
  constructor(store) {
    this.tableView = new TableView();
    this.playerView = new PlayerView();
    this.npcView = new NPCView();
    this.controlView = new ControlView();
    this.modalView = new ModalView();

    store.subscribe(state => this.renderAll(state));
    this.renderAll(store.getState());
  }

  renderAll(state) {
    this.tableView.render(state);
    this.playerView.render(state);
    this.npcView.render(state);
    this.controlView.render(state);
    this.modalView.render(state);
  }
}