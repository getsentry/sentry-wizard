import { Answers, ui } from 'inquirer';
import { nl } from './Logging';

export class BottomBar {
  public static bar: any;
  public static interval: NodeJS.Timer;

  public static show(msg: any) {
    const loader = ['/', '|', '\\', '-'];
    let i = 4;
    BottomBar.bar = new ui.BottomBar({ bottomBar: loader[i % 4] });
    BottomBar.interval = setInterval(() => {
      BottomBar.bar.updateBottomBar(`${loader[i++ % 4]} ${msg}`);
    }, 100);
  }

  public static hide() {
    clearInterval(BottomBar.interval);
    if (BottomBar.bar) {
      BottomBar.bar.updateBottomBar('');
      nl();
      BottomBar.bar.close();
    }
  }
}
