import { TextMessage } from "../Messages/TextMessage";
import { PeerChannel } from "./PeerChannel";
import { DataChannelListner } from "../DataChannels/DataChannelListner";
import { BinaryMessage } from '../Messages/BinaryMessage';
import { Utils } from '../Utils/Utils';




/**
 * Create a new DataChannel for the WebRTCPeerConnection
 *
 * @export
 * @class DataChannel
 */
export class DataChannel {
    Listners: Map<string, DataChannelListner>;
    public label: string;
    public PeerChannels: Map<{ id: string, name: string }, PeerChannel>;



    messageFragments: Map<string, {
        msg: TextMessage, receiveBuffer: ArrayBuffer
    }>;

    constructor(label: string, listeners?: Map<string, DataChannelListner>) {
        this.Listners = listeners || new Map<string, DataChannelListner>();
        this.PeerChannels = new Map<{ id: string, name: string }, PeerChannel>();
        this.label = label;
        this.messageFragments = new Map<string, { msg: TextMessage, receiveBuffer: ArrayBuffer }>();
    }

    private findListener(topic: string): DataChannelListner {
        let listener = Array.from(this.Listners.values()).find((pre: DataChannelListner) => {
            return pre.channelName === this.label && pre.topic === topic;
        });
        return listener;
    }
    /**
     * Add a listener for specific topic
     *
     * @param {string} topic
     * @param {*} fn
     * @returns {DataChannelListner}
     * @memberof DataChannel
     */
    On<T>(topic: string, fn: (message: T, arrayBuffer: ArrayBuffer) => void): DataChannelListner {
        var listener = new DataChannelListner(this.label, topic, fn);
        this.Listners.set(topic, listener);
        return listener;
    }
    /**
     * Remove a listener for specific topic  
     *
     * @param {string} topic
     * @memberof DataChannel
     */
    Off(topic: string): boolean {
        return this.Listners.delete(topic)
    }
    /**
     * Fires then the DataChannel is ready and open
     *
     * @param {Event} event
     * @param {string} peerId
     * @memberof DataChannel
     */
    OnOpen(event: Event, peerId: string, name: string) { }
    /**
     * Fires when the DataChannel is closed or lost
     *
     * @param {Event} event
     * @param {string} peerId
     * @memberof DataChannel
     */
    OnClose(event: Event, peerId: string, name: string) { }
    /**
     * Add a message fragment ( continuous messages )
     *
     * @private
     * @param {TextMessage} message
     * @memberof DataChannel
     */
    private addMessageFragment(message: TextMessage) {
        if (!this.messageFragments.has(message.I)) {
            const data = { msg: message, receiveBuffer:new ArrayBuffer(0) };
            data.receiveBuffer = Utils.joinBuffers(data.receiveBuffer, message.B);
            this.messageFragments.set(message.I, data);
        } else {         
            let current = this.messageFragments.get(message.I);
            current.receiveBuffer = Utils.joinBuffers(current.receiveBuffer,message.B);
        }
        if (message.F) {
            let result = this.messageFragments.get(message.I);        
            result.msg.B = result.receiveBuffer;
            this.dispatchMessage(result.msg);
            this.messageFragments.delete(message.I);
        }
        message.B = new ArrayBuffer(0) //
    }

    private dispatchMessage(msg: TextMessage) {
        let listener = this.findListener(msg.T);
        listener && listener.fn.apply(this, [JSON.parse(msg.D), msg.B]);
    }

    /**
     * Do not overide this method, unless you need it.
     *
     * @param {MessageEvent} event
     * @memberof DataChannel
     */
    onMessage(event: MessageEvent) {
        const isBinary = typeof (event.data) !== "string";
        if (isBinary) {
            this.addMessageFragment(BinaryMessage.fromArrayBuffer(event.data));
        } else {
            this.dispatchMessage(JSON.parse(event.data) as TextMessage)
        }
    }
    /**
     * Close the DataChannel
     *
     * @memberof DataChannel
     */
    Close(name?: string) {
        this.PeerChannels.forEach((pc: PeerChannel) => {
            if (pc.dataChannel.label === name || this.label)
                pc.dataChannel.close();
        });
    }
    /**
     * Send a message to peers 
     *
     * @param {string} topic
     * @param {*} data
     * @returns {DataChannel}
     * @memberof DataChannel
     */
    Invoke(topic: string, data: any, isFinal?: boolean, uuid?: string): DataChannel {
        this.PeerChannels.forEach((channel: PeerChannel) => {
            if (channel.dataChannel.readyState === "open" && channel.label === this.label) {
                channel.dataChannel.send(new TextMessage(topic, data, channel.label, null, uuid, isFinal).toString());
            }
        });
        return this;
    }

    InvokeBinary(topic: string, data: any, arrayBuffer: ArrayBuffer, isFinal: boolean, uuid?: string): DataChannel {

        let m = new TextMessage(topic, data, this.label, null, uuid, isFinal);


        const message = new BinaryMessage(m.toString(),
            arrayBuffer
        );

        this.PeerChannels.forEach((channel: PeerChannel) => {
            if (channel.dataChannel.readyState === "open" && channel.label === this.label) {
                channel.dataChannel.send(message.Buffer);
            }
        });



        return this;

    }

    /**
     *  Add a PeerChannel
     *
     * @param {PeerChannel} pc
     * @memberof DataChannel
     */
    addPeerChannel(pc: PeerChannel) {
        this.PeerChannels.set({
            id: pc.peerId, name: pc.label
        }
            , pc);
    }
    /**
     *  Remove a PeerChannel
     *
     * @param {*} id
     * @returns {boolean}
     * @memberof DataChannel
     */
    removePeerChannel(id: any): boolean {
        return this.PeerChannels.delete({ id: id, name: this.label });
    }
}
