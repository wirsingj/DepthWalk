// Firefox can defer completion callbacks to a 100 ms idle poll. Keep a bounded
// two-frame pipeline, and prompt its poll with an empty submission on active RAFs.
// https://bugzilla.mozilla.org/show_bug.cgi?id=1870699
// This is removable when browsers reliably signal idle-queue completions.
export class FrameQueue{
  constructor(device){this.device=device;this.pending=new Set();this.lastPoll=-Infinity;}
  begin(exclusive=false){
    if(this.pending.size>=(exclusive?1:2)||[...this.pending].some(t=>t.exclusive))return null;
    const token={exclusive};this.pending.add(token);return token;
  }
  finish(token){this.pending.delete(token);}
  poll(now){
    if(!this.pending.size||now-this.lastPoll<8)return;
    this.lastPoll=now;
    // Called at most once per visible animation frame, never from a busy timer.
    this.device.queue.submit([this.device.createCommandEncoder({label:'Completion poll'}).finish()]);
  }
}
