import {BaseStep} from './Step';
import {l, green, dim, nl, bottomBarLoader} from '../Helper';

export default class WaitForSentry extends BaseStep {
  emit() {
    return new Promise(resolve => {
      let [bottomBar, interval] = bottomBarLoader('Waiting for Sentry...');
      // Simulates request
      setTimeout(() => {
        clearInterval(interval);
        bottomBar.close();
        nl();
        resolve();
      }, 5000);
    });
  }
}
