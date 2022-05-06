import { Component, OnInit } from '@angular/core';
import { FormGroup, FormControl, Validators, FormBuilder, NgForm } from '@angular/forms';
import { interval, Observable } from 'rxjs';
import { filter } from 'rxjs/operators';
import { AsyncChainQueue } from './queue/asyncChainQueue';

interface InputToTask {
    runningTotal: number;
    increment: number;
    delayInMilliseconds: number;
}

interface DataFromForm {
    taskValue: number;
    taskTimeInSeconds: number;
}

@Component({
    selector: 'app-root',
    templateUrl: './app.component.html',
    styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
    private tickPeriod = 100;

    private timingStream: Observable<number>;
    private elapsedTime: number;
    private runningTotal: number;
    private waitingToFinish: boolean; // The "yellow" state, where buttons are disabled.
    private finalMessageVisible: boolean;
    private resetCounter = 0;

    private isInInitialState: boolean = true;
    private lastTotal: number = 0;
    private lastTimeCheck: number = 0.0;

    public form: FormGroup;
    private asyncChainQueue: AsyncChainQueue<InputToTask, number, DataFromForm>;

    constructor() {
        this.form = new FormGroup({
            taskValue: new FormControl(1, [ Validators.required, Validators.min(0), Validators.max(100) ]),
            taskTime: new FormControl(4, [ Validators.required, Validators.min(0), Validators.max(10) ])
        });

        this.asyncChainQueue = new AsyncChainQueue<InputToTask, number, DataFromForm>(0);
        this.elapsedTime = 0;
        this.runningTotal = 0;
        this.waitingToFinish = false;
        this.finalMessageVisible = false;
    }

    public ngOnInit(): void {
        this.timingStream = interval(this.tickPeriod).pipe(filter(x => !this.ShowFinalMessage));
        this.timingStream.subscribe(x => {
            this.elapsedTime += this.tickPeriod;
        });
    }

    public get Clock(): string {
        return (0.001 * this.elapsedTime).toFixed(1);
    }

    public get RunningTotal(): string {
        return this.runningTotal.toString();
    }

    public get QueueIsClosed(): boolean {
        return this.asyncChainQueue.IsClosed;
    }

    public get WaitingToFinish(): boolean {
        return this.waitingToFinish;
    }

    public get ShowFinalMessage(): boolean {
        return this.finalMessageVisible;
    }

    public get FinalMessage(): string {
        return this.ShowFinalMessage ? `All tasks processed in ${this.Clock} seconds. Final total is ${this.RunningTotal}.` :
            this.isInInitialState ? 'Add Tasks to Queue, then click one of the two Stop buttons to halt the Queue.' :
            `Queue has been re-opened. The last update was ${this.lastTotal} after ${this.lastTimeCheck} seconds.`;
    }

    public get OpenOrClosedStatus(): string {
        return this.QueueIsClosed ? 'Queue is CLOSED. New Tasks submitted will not start until Queue re-opens. Click to re-open.' :
            this.WaitingToFinish ? 'Queue is OPEN until it finishes. Tasks can still be added.' :
            'Queue is currently OPEN.';
    }

    public reset(): void {
        this.resetCounter++;
        this.finalMessageVisible = false;
        this.isInInitialState = true;
        this.waitingToFinish = false;
        this.elapsedTime = 0;
        this.runningTotal = 0;
        this.asyncChainQueue = new AsyncChainQueue<InputToTask, number, DataFromForm>(0);
    }

    public onSubmit(): void {
        const dataFromForm = { taskValue: this.form.get('taskValue').value, taskTimeInSeconds: this.form.get('taskTime').value };
        this.asyncChainQueue.pushPromiseToQueue(dataFromForm, this.createArgumentsForTask, this.promiseToPushToQueue.bind(this));
    }

    // There are two halting methods that we want to demonstrate:
    // 1: Closing the queue to new tasks, then waiting for it to finish.
    // 2: Leaving the queue open to new tasks, and only closing it once all tasks in the queue are complete.
    //
    // Note that once the queue has started, it cannot be stopped. So if we want to reset the queue, it is up
    // to the caller (i.e. this class) to wait for, then ignore and dispose of the result cleanly. 

    public halt_closeThenFinish(): void {
        this.asyncChainQueue.closeQueueAndGetFinalResult().then(res => {
            // Since the queue could have been reopened, we only show the message if it's still closed.
            this.isInInitialState = false;
            this.lastTotal = this.runningTotal;
            this.lastTimeCheck = parseFloat(this.Clock);
            this.finalMessageVisible = this.asyncChainQueue.IsClosed;
        });
    }

    public halt_finishThenClose(): void {
        this.waitingToFinish = true;
        this.asyncChainQueue.getFinalResultAndCloseWhenAllTasksComplete().then(res => {
            this.waitingToFinish = false;
            this.isInInitialState = false;
            this.lastTotal = this.runningTotal;
            this.lastTimeCheck = parseFloat(this.Clock);
            this.finalMessageVisible = this.asyncChainQueue.IsClosed;
        });
    }

    public openQueue(): void {
        this.finalMessageVisible = false;
        this.waitingToFinish = false;
        this.asyncChainQueue.openQueue();
    }

    private createArgumentsForTask(outputFromLastStep: number, dataFromForm: DataFromForm): InputToTask {
        return {
            runningTotal: outputFromLastStep,
            increment: dataFromForm.taskValue,
            delayInMilliseconds: 1000 * dataFromForm.taskTimeInSeconds
        };
    }

    private promiseToPushToQueue(args: InputToTask): Promise<number> {
        const signalValue = this.resetCounter;
        return new Promise<number>((resolve, reject) => {
            // Setting this.runningTotal is somewhat contrived, but it shows that the UI does not block as the computations run in the background.
            const newRunningTotal = args.runningTotal + args.increment;
            setTimeout(() => {
                if (this.resetCounter === signalValue) {
                    this.runningTotal = newRunningTotal;
                    resolve(newRunningTotal);
                }
            }, args.delayInMilliseconds);
        });
    }

}
