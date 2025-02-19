import { ui } from 'inquirer';

import { nl } from './Logging';

export class BottomBar {
  public static bar: typeof ui.BottomBar;
  public static interval: NodeJS.Timeout;

  // eslint-disable-next-line @typescript-eslint/explicit-module-boundary-types
  public static show(msg: string): void {
    const loader = ['/', '|', '\\', '-'];
    let i = 4;
    BottomBar.bar = new ui.BottomBar({ bottomBar: loader[i % 4] });
    BottomBar.interval = setInterval(() => {
      // eslint-disable-next-line no-plusplus
      BottomBar.bar.updateBottomBar(`${loader[i++ % 4]} ${msg}`);
    }, 100);
  }

  public static hide(): void {
    clearInterval(BottomBar.interval);
    if (BottomBar.bar) {
      BottomBar.bar.updateBottomBar('');
      nl();
      BottomBar.bar.close();
    }
  }
}
