import {BaseStep} from './Step';
import {l, green, dim, nl} from '../Helper';
let open = require('open');

export default class OpenSentry extends BaseStep {
  emit() {
    let url = 'https://sentry.io/wiz/3928f9833nv39unf230dfj2030fh230fh230f8h';
    open(url);
    nl();
    l('Please open');
    green(url);
    l('in your browser');
    nl();
    return Promise.resolve({});
  }
}
