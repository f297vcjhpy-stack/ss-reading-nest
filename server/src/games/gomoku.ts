export type Game = { id: string; version: number; board: number[]; turn: 1 | 2; winner: 0 | 1 | 2 | 3; last: number | null };
export function newGame(): Game { return { id: crypto.randomUUID(), version: 0, board: Array(225).fill(0), turn: 1, winner: 0, last: null }; }
export function move(game: Game, row: number, col: number, player: number): Game {
  if (!Number.isInteger(row) || !Number.isInteger(col) || row < 1 || row > 15 || col < 1 || col > 15) throw Error("坐标应为1到15的整数");
  if (game.winner) throw Error("本局已结束");
  if (player !== game.turn) throw Error("还没轮到你");
  const index = (row - 1) * 15 + col - 1;
  if (game.board[index]) throw Error("这里已有棋子");
  const result = structuredClone(game);
  result.board[index] = player; result.last = index; result.version++;
  for (const [dr, dc] of ([[1,0],[0,1],[1,1],[1,-1]] as const)) {
    let count = 1;
    for (const sign of [-1,1]) {
      let r=row-1+dr*sign, c=col-1+dc*sign;
      while (r>=0 && r<15 && c>=0 && c<15 && result.board[r*15+c]===player) { count++; r+=dr*sign; c+=dc*sign; }
    }
    if (count>=5) result.winner=player as 1|2;
  }
  if (!result.winner && result.board.every(Boolean)) result.winner=3;
  result.turn=player===1?2:1;
  return result;
}
export class GomokuStore {
  constructor(private db: D1Database) {}
  private async init() { await this.db.prepare("CREATE TABLE IF NOT EXISTS an_gomoku (slot INTEGER PRIMARY KEY CHECK(slot=1), version INTEGER NOT NULL, data TEXT NOT NULL)").run(); }
  async get(): Promise<Game> {
    await this.init();
    await this.db.prepare("INSERT OR IGNORE INTO an_gomoku (slot,version,data) VALUES (1,0,?)").bind(JSON.stringify(newGame())).run();
    const row=await this.db.prepare("SELECT data FROM an_gomoku WHERE slot=1").first<{data:string}>();
    return JSON.parse(row!.data);
  }
  async play(id: string, version: number, row: number, col: number, player: number) {
    const game=await this.get();
    if(game.id!==id || game.version!==version) throw Error("棋盘已更新，请刷新再落子");
    const next=move(game,row,col,player); await this.save(game,next); return next;
  }
  async restart(id: string, version: number) {
    const game=await this.get();
    if(game.id!==id || game.version!==version) throw Error("棋盘已更新，请刷新");
    const next=newGame(); next.version=game.version+1; await this.save(game,next); return next;
  }
  private async save(old:Game,next:Game) {
    const result=await this.db.prepare("UPDATE an_gomoku SET data=?,version=? WHERE slot=1 AND version=?").bind(JSON.stringify(next),next.version,old.version).run();
    if(result.meta.changes!==1) throw Error("有同时落子，请刷新棋盘");
  }
}
