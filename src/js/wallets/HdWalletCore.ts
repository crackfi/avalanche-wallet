import { ChainAlias } from '@/js/wallets/types'
import { UTXO } from 'avalanche/dist/apis/avm'

import { BN, Buffer } from 'avalanche'
import { ITransaction } from '@/components/wallet/transfer/types'
import { ava, avm, bintools, pChain } from '@/AVA'
import { UTXOSet as AVMUTXOSet } from 'avalanche/dist/apis/avm/utxos'
import HDKey from 'hdkey'
import { HdHelper } from '@/js/HdHelper'
import { UTXOSet as PlatformUTXOSet } from 'avalanche/dist/apis/platformvm/utxos'
import { buildCreateNftFamilyTx, buildMintNftTx, buildUnsignedTransaction } from '../TxHelper'
import { WalletCore } from '@/js/wallets/WalletCore'

// A base class other HD wallets are based on.
// Mnemonic Wallet and LedgerWallet uses this

class HdWalletCore extends WalletCore {
    chainId: string

    internalHelper: HdHelper
    externalHelper: HdHelper
    platformHelper: HdHelper

    constructor(accountHdKey: HDKey, isPublic = true) {
        super()

        this.chainId = avm.getBlockchainAlias() || avm.getBlockchainID()
        this.externalHelper = new HdHelper('m/0', accountHdKey, undefined, isPublic)
        this.internalHelper = new HdHelper('m/1', accountHdKey, undefined, isPublic)
        this.platformHelper = new HdHelper('m/0', accountHdKey, 'P', isPublic)

        this.externalHelper.oninit().then((res) => {
            this.updateInitState()
        })
        this.internalHelper.oninit().then((res) => {
            this.updateInitState()
        })
        this.platformHelper.oninit().then((res) => {
            this.updateInitState()
        })
    }

    getUTXOSet(): AVMUTXOSet {
        return this.utxoset
    }

    updateAvmUTXOSet(): void {
        // if (this.isFetchUtxos) return
        let setExternal = this.externalHelper.utxoSet as AVMUTXOSet
        let setInternal = this.internalHelper.utxoSet as AVMUTXOSet

        let joined = setInternal.merge(setExternal)
        this.utxoset = joined
    }

    getFirstAvailableAddressPlatform(): string {
        return this.platformHelper.getFirstAvailableAddress()
    }

    updateFetchState() {
        this.isFetchUtxos =
            this.externalHelper.isFetchUtxo ||
            this.internalHelper.isFetchUtxo ||
            this.platformHelper.isFetchUtxo
    }

    updateInitState() {
        this.isInit =
            this.externalHelper.isInit && this.internalHelper.isInit && this.platformHelper.isInit
    }
    // Fetches the utxos
    async getUTXOs(): Promise<void> {
        this.internalHelper.updateUtxos().then((utxoSet) => {
            this.updateFetchState()
            this.updateAvmUTXOSet()
        })

        this.externalHelper.updateUtxos().then((utxoSet) => {
            this.updateFetchState()
            this.updateAvmUTXOSet()
        })

        // platform utxos are updated but not returned by function
        this.platformHelper.updateUtxos().then((utxoSet) => {
            this.updateFetchState()
        })

        return
    }

    getAllDerivedExternalAddresses(): string[] {
        return this.externalHelper.getAllDerivedAddresses()
    }

    getDerivedAddresses(): string[] {
        let internal = this.internalHelper.getAllDerivedAddresses()
        let external = this.externalHelper.getAllDerivedAddresses()
        return internal.concat(external)
    }

    getDerivedAddressesP(): string[] {
        return this.platformHelper.getAllDerivedAddresses()
    }

    getAllAddressesX() {
        return this.getDerivedAddresses()
    }

    getAllAddressesP() {
        return this.getDerivedAddressesP()
    }
    // Returns addresses to check for history
    getHistoryAddresses(): string[] {
        let internalIndex = this.internalHelper.hdIndex
        // They share the same address space, so whatever has the highest index
        let externalIndex = Math.max(this.externalHelper.hdIndex, this.platformHelper.hdIndex)

        let internal = this.internalHelper.getAllDerivedAddresses(internalIndex)
        let external = this.externalHelper.getAllDerivedAddresses(externalIndex)
        return internal.concat(external)
    }

    getCurrentAddressAvm(): string {
        return this.externalHelper.getCurrentAddress()
    }

    getChangeAddressAvm() {
        return this.internalHelper.getCurrentAddress()
    }

    getChangeAddressPlatform() {
        return this.platformHelper.getCurrentAddress()
    }

    getChangePath(chainId?: ChainAlias): string {
        switch (chainId) {
            case 'P':
                return this.platformHelper.changePath
            case 'X':
            default:
                return this.internalHelper.changePath
        }
    }

    getChangeIndex(chainId?: ChainAlias): number {
        switch (chainId) {
            case 'P':
                return this.platformHelper.hdIndex
            case 'X':
            default:
                return this.internalHelper.hdIndex
        }
    }

    getChangeFromIndex(idx?: number, chainId?: ChainAlias): string | null {
        if (idx === undefined || idx === null) return null

        switch (chainId) {
            case 'P':
                return this.platformHelper.getAddressForIndex(idx)
            case 'X':
            default:
                return this.internalHelper.getAddressForIndex(idx)
        }
    }

    getPlatformRewardAddress(): string {
        return this.platformHelper.getCurrentAddress()
    }

    getCurrentAddressPlatform(): string {
        return this.platformHelper.getCurrentAddress()
    }

    getPlatformUTXOSet() {
        return this.platformHelper.utxoSet as PlatformUTXOSet
    }

    getPlatformActiveIndex() {
        return this.platformHelper.hdIndex
    }

    getExternalActiveIndex() {
        return this.externalHelper.hdIndex
    }

    getBaseAddress() {
        return this.externalHelper.getAddressForIndex(0)
    }

    onnetworkchange(): void {
        this.isInit = false
        this.stakeAmount = new BN(0)

        this.externalHelper.onNetworkChange().then(() => {
            this.updateInitState()
        })
        this.internalHelper.onNetworkChange().then(() => {
            this.updateInitState()
        })
        this.platformHelper.onNetworkChange().then(() => {
            this.updateInitState()
        })

        // TODO: Handle EVM changes
    }

    async buildUnsignedTransaction(orders: (ITransaction | UTXO)[], addr: string, memo?: Buffer) {
        const changeAddress = this.getChangeAddressAvm()
        const derivedAddresses: string[] = this.getDerivedAddresses()
        const utxoset = this.getUTXOSet()

        return buildUnsignedTransaction(
            orders,
            addr,
            derivedAddresses,
            utxoset,
            changeAddress,
            memo
        )
    }
}
export { HdWalletCore }
