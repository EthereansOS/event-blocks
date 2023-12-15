require('dotenv').config()
var Web3 = require('web3')
var fs = require('fs')
var path = require('path')

const VOID_ETHEREUM_ADDRESS = '0x0000000000000000000000000000000000000000'

var out = {}

var file = path.resolve(__dirname, "output", 'output.json')

try {
    out = JSON.parse(fs.readFileSync(file, 'utf-8'))
} catch (e) {}

function save() {
    try {
        fs.unlinkSync(file)
    } catch (e) {}
    try {
        fs.writeFileSync(file, JSON.stringify(out, null, 4))
    } catch (e) {}
}

var web3 = new Web3.Web3(process.env.BLOCKCHAIN_CONNECTION_STRING)
var web3Utils = web3.utils
var abi = {
    encode: web3.eth.abi.encodeParameters,
    decode: web3.eth.abi.decodeParameters
}
var chainId
var configuration
var data
var firstBlock
var latestBlock

async function main() {
    chainId = parseInt(await web3.eth.getChainId())
    latestBlock = parseInt(await web3.eth.getBlockNumber())
    configuration = require('./configuration')[chainId]
    data = (out[chainId] = out[chainId] || {})
    data.fromBlock = data.fromBlock || configuration.deploySearchStart
    data.blocks = data.blocks || []
    firstBlock = data.lastSearchedBlock || data.toBlock || data.fromBlock
    await items()
    await l2Bridge()
    await fof()
    data.blocks = data.blocks.filter((it, i, arr) => arr.indexOf(it) === i).sort((a, b) => a - b)

    if(data.blocks.length != 0) {
        var fromBlock = Math.min(...data.blocks)
        if(!data.fromBlock || data.fromBlock > fromBlock) {
            data.fromBlock = fromBlock
        }

        var toBlock = Math.max(...data.blocks)
        if(!data.toBlock || data.toBlock < toBlock) {
            data.toBlock = toBlock
        }
    }
    data.lastSearchedBlock = latestBlock
    save()
}

async function items() {

    var address = [
        configuration.itemMainInterfaceAddress,
        configuration.eRC20WrapperAddress,
        configuration.eRC721WrapperAddress,
        configuration.eRC1155WrapperAddress,
        configuration.eRC721WrapperDeckAddress,
        configuration.eRC1155WrapperDeckAddress
    ]

    var args = {
        address : address.filter(it => it != VOID_ETHEREUM_ADDRESS),
        topics : [
            [
                web3Utils.sha3("Collection(address,address,bytes32)"),
                web3Utils.sha3("CollectionItem(bytes32,bytes32,uint256)"),
                web3Utils.sha3("Token(address,uint256,uint256)"),
                web3Utils.sha3("Token(address,uint256)"),
                web3Utils.sha3("ReserveData(address,address,uint256,uint256,uint256,bytes32)"),
                web3Utils.sha3("ReserveDataUnlocked(address,bytes32,address,uint256,address,uint256,uint256)"),
                web3Utils.sha3('Deployed(address,address,address,bytes)'),
                web3Utils.sha3("Operator(uint256,address,address)"),
                web3Utils.sha3("TransferSingle(address,address,address,uint256,uint256)"),
                web3Utils.sha3("TransferBatch(address,address,address,uint256[],uint256[])")
            ]
        ],
        fromBlock : web3Utils.numberToHex(firstBlock),
        toBlock : web3Utils.numberToHex(latestBlock)
    }

    var logs = await getLogs(web3, args)
    data.blocks.push(...logs.map(it => parseInt(it.blockNumber)))
}

async function l2Bridge() {

    if(!configuration.L2StandardTokenFactoryAddress) {
        return
    }

    var args = {
        address : configuration.L2StandardTokenFactoryAddress,
        topics : [
            web3Utils.sha3('StandardL2TokenCreated(address,address)')
        ],
        fromBlock : web3Utils.numberToHex(firstBlock),
        toBlock : web3Utils.numberToHex(latestBlock)
    }

    var logs = await getLogs(web3, args)
    data.blocks.push(...logs.map(it => parseInt(it.blockNumber)))
}

async function fof() {

    var address = await getRawField(web3, configuration.factoryOfFactoriesAddress, 'all')
    address = abi.decode(["address[]", "address[][]"], address)
    address = address[1]
    address = address.reduce((acc, it) => [...acc, ...it], [])

    var args = {
        address : address.filter(it => it != VOID_ETHEREUM_ADDRESS),
        topics : [
            web3Utils.sha3('Deployed(address,address,address,bytes)')
        ],
        fromBlock : web3Utils.numberToHex(firstBlock),
        toBlock : web3Utils.numberToHex(latestBlock)
    }

    var logs = await getLogs(web3, args)
    data.blocks.push(...logs.map(it => parseInt(it.blockNumber)))

    address = logs.map(it => abi.decode(["address"], it.topics[2])[0])

    var topics = [
        [
            web3Utils.sha3('ComponetSet(bytes32,address,address,bool)'),
            web3Utils.sha3('Proposed(uint256,uint256,bytes32)'),
            web3Utils.sha3('RewardToken(address)'),
            web3Utils.sha3('FarmToken(uint256,address,uint256,uint256)')
        ]
    ]

    args = {
        ...args,
        address : address.filter(it => it != VOID_ETHEREUM_ADDRESS),
        topics
    }
    logs = await getLogs(web3, args)
    data.blocks.push(...logs.map(it => parseInt(it.blockNumber)))

    address = logs.map(it => it.topics[0] !== topics[0] ? [] : [
        abi.decode(["address"], it.topics[2])[0],
        abi.decode(["address"], it.topics[3])[0],
    ])
    address = address.reduce((acc, it) => [...acc, ...it], [])

    args = {
        ...args,
        address : address.filter(it => it != VOID_ETHEREUM_ADDRESS),
        topics : [
            [
                web3Utils.sha3('ProposalCreated(address,address,bytes32)'),
                web3Utils.sha3('ProposalWeight(bytes32,address,uint256,bytes32,uint256)'),
                web3Utils.sha3('ProposalTerminated(bytes32,bool,bytes)'),
                web3Utils.sha3('Accept(bytes32,address,bytes32,uint256)'),
                web3Utils.sha3('MoveToAccept(bytes32,address,bytes32,uint256)'),
                web3Utils.sha3('RetireAccept(bytes32,address,bytes32,uint256)'),
                web3Utils.sha3('Refuse(bytes32,address,bytes32,uint256)'),
                web3Utils.sha3('MoveToRefuse(bytes32,address,bytes32,uint256)'),
                web3Utils.sha3('RetireRefuse(bytes32,address,bytes32,uint256)'),
                web3Utils.sha3('SubDAOSet(bytes32,address,address)'),
                web3Utils.sha3('ProposalTerminated(bytes32,bool,bytes)'),
                web3Utils.sha3('Wrapped(address,uint256,address,uint256)'),
                web3Utils.sha3('DelegationSet(address,address)'),
                web3Utils.sha3('SupportedToken(address,uint256)'),
                web3Utils.sha3('Factory(address,bool)')
            ]
        ]
    }
    logs = await getLogs(web3, args)
    data.blocks.push(...logs.map(it => parseInt(it.blockNumber)))
}

async function getRawField(web3, to, fieldName) {

    var response = '0x'
    var data = web3Utils.sha3(fieldName + '()').substring(0, 10)
    if (fieldName.indexOf('(') !== -1 && fieldName.indexOf('()') === -1) {
        var fields = fieldName.split('(')[1]
        fields = fields.split(')')[0]
        fields = fields.split(',')
        fields = abi.encode(fields, [...arguments].slice(3, arguments.length))
        data = (web3Utils.sha3(fieldName).substring(0, 10)) + fields.substring(2)
    }
    while (true) {
        try {
            response = await web3.eth.call({
                    to,
                    data
                }, 'latest')
            break
        } catch (e) {
            var message = (e.stack || e.message || e).toLowerCase()
            if (message.indexOf("response has no error") === -1) {
                break
            }
        }
    }

    return response
}

async function getLogs(web3, args) {
    args.toBlock = args.toBlock || 'latest'

    var firstBlock = parseInt(args.fromBlock)
    firstBlock = isNaN(firstBlock) ? 0 : firstBlock

    var lastBlock = parseInt(args.toBlock)
    lastBlock = isNaN(lastBlock) ? latestBlock : lastBlock

    firstBlock = parseInt(firstBlock)
    lastBlock = parseInt(lastBlock)

    const interval = chainId === 10 ? 4500000 : 45000

    var logs = []

    var ranges = [[firstBlock, lastBlock]]

    for (var range of ranges) {
        var start = range[0]
        var end = start + interval
        end = end > range[1] ? range[1] : end

        while (start < end) {
            logs.push(
                (async() => {
                    var newArgs = {
                        ...args,
                        fromBlock: web3Utils.toHex(start),
                        toBlock: web3Utils.toHex(end),
                    }
                    try {
                        return await web3.eth.getPastLogs(newArgs)
                    } catch (e) {
                        var message = (e.stack || e.message || e).toLowerCase()
                        if (message.indexOf('response has no error') !== -1) {
                            return []
                        }
                    }
                    return []
                })()
            )
            if (end === range[1]) {
                break
            }
            start = end
            end = start + interval
            end = end > range[1] ? range[1] : end
        }
    }

    logs = await Promise.all(logs)
    logs = logs.reduce((acc, it) => [...acc, ...it], [])

    return logs
}

main().catch(console.log)