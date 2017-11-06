import {prompt, Question, Answers} from 'inquirer';
import {BaseStep} from './Step';
import {dim} from '../Helper';

export default class PromptTest extends BaseStep {
  emit(answers?: Answers) {
    this.debug(answers);
    return prompt([{name: `${Math.floor(Math.random() * 100)}`, message: 'yeah'}]);
  }
}
