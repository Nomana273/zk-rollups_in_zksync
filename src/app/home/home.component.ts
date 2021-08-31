import { Component, OnInit } from '@angular/core';
import { finalize } from 'rxjs/operators';
import * as zksync from 'zksync';
import { Wallet } from 'zksync';
import { QuoteService } from './quote.service';
import { ethers } from 'ethers';

import { serializeTx } from 'zksync/build/utils';
import { concat } from 'rxjs';
@Component({
  selector: 'app-home',
  templateUrl: './home.component.html',
  styleUrls: ['./home.component.scss'],
})
export class HomeComponent implements OnInit {
  quote: string | undefined;
  isLoading = false;
  processing: any[] = [];
  transactionProcessing: any[] = [];
  amount = '0.1';
  noOfTransactions = 20;
  amountPerTransaction = '0.01';
  initializeZKSyncTime : number;
  seedPhrase = 
  syncWallet: any;
  walletReady: boolean = false;
  transactions: any;
  syncProvider: any;

  constructor(private quoteService: QuoteService) {}

  ngOnInit() {
    this.isLoading = true;
    this.quoteService
      .getRandomQuote({ category: 'dev' })
      .pipe(
        finalize(() => {
          this.isLoading = false;
        })
      )
      .subscribe((quote: string) => {
        this.quote = quote;
      });
  }

  async initializeZKSync() {
    let startTime = performance.now();
    this.processing.push('Initializing ZKSync');
    this.syncProvider = await zksync.getDefaultProvider('rinkeby');
    const ethersProvider = ethers.getDefaultProvider('rinkeby');
    await this.createZksyncWallet(this.syncProvider, ethersProvider);
    let endTime = performance.now();
    this.initializeZKSyncTime = endTime- startTime;
  }

  async createZksyncWallet(syncProvider: any, ethersProvider: any) {
    this.processing.push('Creating ZKSync Wallet');
    // this.seedPhrase = 'alarm print steak pole auction wonder fuel fatigue license exhibit album lazy';
    // Create ethereum wallet using ethers.js
    const ethWallet = ethers.Wallet.fromMnemonic(this.seedPhrase).connect(ethersProvider);

    // Derive zksync.Signer from ethereum wallet.
    this.syncWallet = await zksync.Wallet.fromEthSigner(ethWallet, syncProvider);
    await this.depositToZksync();
    await this.unlockZKSyncAccount();
    await this.checkZkAccountBalance();
    await this.getAccountState();
    this.walletReady = true;
  }
  async batchTransfer() {
    this.transactionProcessing.push(`Batch transfer initiating...`);
    const batchBuilder = this.syncWallet.batchBuilder();
    console.log(this.syncWallet);

    for (let x = 1; x <= this.noOfTransactions; x++) {
      let request = {
      
        to:
        token: 'ETH',
        amount: ethers.utils.parseEther(this.amountPerTransaction + x),
      };
      batchBuilder.addTransfer(request);
    }

    this.transactionProcessing.push(`Building to main chain...`);
    let startTime1 = performance.now();
    let response = await batchBuilder.build('ETH');
    let endTime1 = performance.now();

    console.log(response);
    this.transactionProcessing.push('Signature: ' + JSON.stringify(response.signature));
    this.transactionProcessing.push('Total Fee: ' + '--------------');
    this.transactions = [];
    response.txs.forEach((data: any, index:any) => {
      let sign = data.signature;
      data = data.tx;
      this.transactionProcessing.push('****************************************');
      this.transactionProcessing.push(`tx_type: Transfer`);
      this.transactionProcessing.push(`Account ID: ${data.accountId}`);
      this.transactionProcessing.push(`From: ${data.from}`);
      this.transactionProcessing.push(`To: ${data.to}`);
      this.transactionProcessing.push(`Token ID: ${data.tokenId}`);
      this.transactionProcessing.push(`Amount: ${data.amount}`);
      this.transactionProcessing.push(`Fee: ${data.fee}`);
      this.transactionProcessing.push(`Valid From: ${data.validFrom}`);
      this.transactionProcessing.push(`Valid Until: ${data.validUntil}`);
      this.transactionProcessing.push(`Type: ${data.type}`);
      this.transactionProcessing.push(`Signature: ${JSON.stringify(data.signature)}`);
      this.transactionProcessing.push(`Nonce: ${data.nonce}`);
      this.transactions.push({
        tx: data,
      });
      //console.log(`>>>>>>>>Transaction ${index+1} stats`);
      //console.log(`Byte size of To is ${this.byteCount(data.to)}`);
      //console.log(`Byte size of From is ${this.byteCount(data.from)}`);
      //console.log(`Byte size of Nonce is ${this.byteCount(data.nonce)}`);
      //console.log(`Byte size of ECDSA is ${this.byteCount('ECDSA')}`);
    });
    //console.log(`Byte size of Signature is ${this.byteCount(response.signature)}`);
    console.log(this.transactions);
    let startTime2 = performance.now();
    //Submit batch
    const transactionHashes = await this.syncProvider.submitTxsBatch(this.transactions,response.signature);
    let endTime2 = performance.now();
    console.log(transactionHashes);
    this.transactionProcessing.push(`transactionHashes: ${transactionHashes}`);
    let totalTime = (endTime1-startTime1)+(endTime2-startTime2);
    console.log("Time Used",(((totalTime + this.initializeZKSyncTime) / 1000) / 60));
  }

  async depositToZksync() {
    this.processing.push('Depositing from Eth Wallet to ZKSync Wallet');
    const deposit = await this.syncWallet.depositToSyncFromEthereum({
      depositTo: this.syncWallet.address(),
      token: 'ETH',
      amount: ethers.utils.parseEther(this.amount),
    });

    // Await confirmation from the zkSync operator
    // Completes when a promise is issued to process the tx
    this.processing.push(JSON.stringify('Waiting for confirmation from zkSync operator'));
    const depositReceipt = await deposit.awaitReceipt();
    this.processing.push(JSON.stringify('Confirmation completed'));

    this.processing.push(JSON.stringify(depositReceipt));

    // // Await verification
    // // Completes when the tx reaches finality on Ethereum
    // this.processing.push(JSON.stringify('Await verification'));
    // const depositReceipt1 = await deposit.awaitVerifyReceipt();
    // this.processing.push(JSON.stringify('Verification completed'));
    // this.processing.push(JSON.stringify(depositReceipt1));
  }

  async unlockZKSyncAccount() {
    this.processing.push('Unlocking ZKSync Account');
    if (!(await this.syncWallet.isSigningKeySet())) {
      if ((await this.syncWallet.getAccountId()) == undefined) {
        throw new Error('Unknown account');
      }

      // As any other kind of transaction, `ChangePubKey` transaction requires fee.
      // User doesn't have (but can) to specify the fee amount. If omitted, library will query zkSync node for
      // the lowest possible amount.
      const changePubkey = await this.syncWallet.setSigningKey({
        feeToken: 'ETH',
        ethAuthType: 'ECDSA',
      });

      // Wait until the tx is committed
      await changePubkey.awaitReceipt();
    }
  }

  async checkZkAccountBalance() {
    this.processing.push('Checking ZKSync Account Balance');
    // Committed state is not final yet
    const committedETHBalance = await this.syncWallet.getBalance('ETH');

    // Verified state is final
    const verifiedETHBalance = await this.syncWallet.getBalance('ETH', 'verified');
  }
  async getAccountState() {
    const state = await this.syncWallet.getAccountState();
    const committedBalances = state.committed.balances;
    const committedETHBalance = committedBalances['ETH'];
    this.processing.push('Committed Eth Balance =' + committedETHBalance);
    const verifiedBalances = state.verified.balances;
    const verifiedETHBalance = verifiedBalances['ETH'];
    this.processing.push('Verified Eth Balance =' + verifiedETHBalance);
  }
  byteCount(s:any) {
    return encodeURI(s).split(/%..|./).length - 1;
  }
}
