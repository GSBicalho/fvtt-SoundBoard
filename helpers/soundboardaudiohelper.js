// eslint-disable-next-line no-unused-vars
class SBAudioHelper {

    activeSounds = [];

    constructor() {
    }

    delayIntervals = {
        intervals: new Set(), make(callback, time) {
            var newInterval = setInterval(callback, time);
            this.intervals.add(newInterval);
            return newInterval;
        },

        // clear a single interval
        clear(id) {
            this.intervals.delete(id);
            return clearInterval(id);
        },

        // clear all intervals
        clearAll() {
            for (var id of this.intervals) {
                this.clear(id);
            }
        }
    };

    //0.8.1+ goodies
    detuneNode(soundNode, detuneBy) {
        if (detuneBy === 0) {
            return;
        }
        if (soundNode.container.isBuffer) {
            soundNode.node.detune.value = detuneBy;
        } else {
            soundNode.container.element.preservesPitch = false;
            // -500 to 500 mapped to 0.8 to 1.2
            soundNode.container.element.playbackRate = 1 + ((detuneBy / 500) * 0.2);
        }
    }

    // lowpassFilter() {
    //     let lowPassCoefs = [{
    //         frequency: 200,
    //         feedforward: [0.00020298, 0.0004059599, 0.00020298],
    //         feedback: [1.0126964558, -1.9991880801, 0.9873035442]
    //     }, {
    //         frequency: 500,
    //         feedforward: [0.0012681742, 0.0025363483, 0.0012681742],
    //         feedback: [1.0317185917, -1.9949273033, 0.9682814083]
    //     }, {
    //         frequency: 1000,
    //         feedforward: [0.0050662636, 0.0101325272, 0.0050662636],
    //         feedback: [1.0632762845, -1.9797349456, 0.9367237155]
    //     }, {
    //         frequency: 5000,
    //         feedforward: [0.1215955842, 0.2431911684, 0.1215955842],
    //         feedback: [1.2912769759, -1.5136176632, 0.7087230241]
    //     }];
    //
    //     let feedForward = lowPassCoefs[SBAudioHelper.filterNumber].feedforward,
    //         feedBack = lowPassCoefs[SBAudioHelper.filterNumber].feedback;
    //
    //     // eslint-disable-next-line no-unused-vars
    //     const iirfilter = game.audio.context.createIIRFilter(feedForward, feedBack);
    // }

    async play({src, volume, detune}, sound) {
        if (game.settings.get('core', 'globalInterfaceVolume') === 0) {
            ui.notifications.warn(game.i18n.localize('SOUNDBOARD.notif.interfaceMuted'));
        }
        volume *= game.settings.get('core', 'globalInterfaceVolume');

        var soundNode = new foundry.audio.Sound(src);
        soundNode.loop = sound.loop;
        soundNode.addEventListener('end', () => {
            this.removeActiveSound(soundNode);
            try {
                soundNode.stop();
            } catch (e) {
                // Do nothing
            }
            if (sound?.loop) {
                if (!sound?.loopDelay || sound?.loopDelay === 0) {
                    SoundBoard.playSound(sound.identifyingPath, true);
                } else {
                    let interval = this.delayIntervals.make(() => {
                        SoundBoard.playSound(sound.identifyingPath, true);
                        this.delayIntervals.clear(interval);
                    }, sound.loopDelay * 1000);
                }
            }
        });

        soundNode.addEventListener('stop', () => {
            if (sound?.loop) {
                sound.loop = false;
            }
        });

        soundNode.addEventListener("play", () => {
            this.detuneNode(soundNode, detune);
            
            let individualGainNode = game.audio.context.createGain();
            individualGainNode.gain.value = soundNode.individualVolume;
            soundNode.sourceNode.disconnect();
            individualGainNode.connect(game.audio.soundboardGain);
            soundNode.sourceNode.connect(individualGainNode);
            soundNode.individualGainNode = individualGainNode;
            // soundNode.node.connect(iirfilter).connect(AudioHelper.soundboardGain);
            this.activeSounds.push(soundNode);
        });
        if (!soundNode.loaded) {
            await soundNode.load();
        }

        if (!game.audio.soundboardGain) {
            game.audio.soundboardGain = game.audio.context.createGain();
            game.audio.soundboardGain.connect(game.audio.context.destination);
        }
        game.audio.soundboardGain.gain.value = volume;
        soundNode.identifyingPath = sound.identifyingPath;
        soundNode.individualVolume = sound.individualVolume;
        soundNode.play({
            volume
        });

    }

    async cache({src, volume}) {
        var soundNode = new foundry.audio.Sound(src);
        await soundNode.load();
        let player = game.user.name;
        SoundBoard.socketHelper.sendData({
            type: SBSocketHelper.SOCKETMESSAGETYPE.CACHECOMPLETE, payload: {
                src, volume, player
            }
        });
    }

    // eslint-disable-next-line no-unused-vars
    cacheComplete({src, _volume, player}) {
        ui.notifications.notify(`${player} cache complete for ${src}`);
    }

    _callStop(sound) {
        if (!sound.isBuffer) {
            sound.element.onended = undefined;
            sound.element.pause();
            sound.element.src = '';
            sound.element.remove();
        }

        sound.stop();
    }

    stop(soundObj) {
        this.activeSounds.filter(sound => {
            return soundObj.src.includes(sound.src);
        }).forEach(sound => {
            try {
                this._callStop(sound);
            } catch (e) {
                // Do nothing
            }
            this.removeActiveSound(sound);
        });
    }

    stopAll() {
        for (let sound of this.activeSounds) {
            try {
                this._callStop(sound);
            } catch (e) {
                // Do nothing
            }
        }
        this.activeSounds = [];
    }

    getActiveSounds() {
        return this.activeSounds;
    }

    removeActiveSound(sound) {
        let soundIndex;
        soundIndex = this.activeSounds.findIndex((element) => {
            return element.id === sound.id;
        });
        if (soundIndex > -1) {
            this.activeSounds.splice(soundIndex, 1);
        }
    }

    onVolumeChange(volume, individualVolumes) {

        volume *= game.settings.get('core', 'globalInterfaceVolume');
        if (game.audio.soundboardGain) {
            game.audio.soundboardGain.gain.value = volume;
        }
        this.activeSounds.forEach(sound => {
            if (individualVolumes) {
                if (individualVolumes[sound.identifyingPath]) {
                    sound.individualGainNode.gain.value = parseInt(individualVolumes[sound.identifyingPath]) / 100;
                }
            }
        });
    }
}