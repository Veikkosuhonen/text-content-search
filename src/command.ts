import { Command } from 'commander';
import { analyse } from './analyse.js';

const program = new Command();

program
    .action(analyse)
    .description('This is a description')

export const run = () => program.parse(process.argv);
