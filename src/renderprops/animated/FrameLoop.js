import Animated from './Animated'
import { now, requestFrame } from './Globals'

let active = false
const controllers = new Set()

const frameLoop = () => {
  let time = now()
  for (let controller of controllers) {
    let isDone = true
    let noChange = true

    for (
      let configIdx = 0;
      configIdx < controller.configs.length;
      configIdx++
    ) {
      let config = controller.configs[configIdx]

      let endOfAnimation, lastTime, velocity
      for (let valIdx = 0; valIdx < config.animatedValues.length; valIdx++) {
        let animation = config.animatedValues[valIdx]

        // If an animation is done, skip, until all of them conclude
        if (animation.done) continue

        let from = config.fromValues[valIdx]
        let to = config.toValues[valIdx]
        let position = animation.lastPosition
        let isAnimated = to instanceof Animated
        let velocity = Array.isArray(config.initialVelocity)
          ? config.initialVelocity[valIdx]
          : config.initialVelocity
        if (isAnimated) to = to.getValue()

        // Conclude animation if it's either immediate, or from-values match end-state
        if (config.immediate || (!isAnimated && !config.decay && from === to)) {
          animation.updateValue(to)
          animation.done = true
          continue
        }

        // Doing delay here instead of setTimeout is one async worry less
        if (config.delay && time - controller.startTime < config.delay) {
          isDone = false
          continue
        }

        // Flag change
        noChange = false

        // Break animation when string values are involved
        if (typeof from === 'string' || typeof to === 'string') {
          animation.updateValue(to)
          animation.done = true
          continue
        }

        if (config.duration !== void 0) {
          /** Duration easing */
          position =
            from +
            config.easing(
              (time - controller.startTime - config.delay) / config.duration
            ) *
              (to - from)
          endOfAnimation =
            time >= controller.startTime + config.delay + config.duration
        } else if (config.decay) {
          /** Decay easing */
          position =
            from +
            (velocity / (1 - 0.998)) *
              (1 - Math.exp(-(1 - 0.998) * (time - controller.startTime)))
          endOfAnimation = Math.abs(animation.lastPosition - position) < 0.1
          if (endOfAnimation) to = position
        } else {
          /** Spring easing */
          lastTime = animation.lastTime !== void 0 ? animation.lastTime : time
          velocity =
            animation.lastVelocity !== void 0
              ? animation.lastVelocity
              : config.initialVelocity

          // If we lost a lot of frames just jump to the end.
          if (time > lastTime + 64) lastTime = time
          // http://gafferongames.com/game-physics/fix-your-timestep/
          let numSteps = Math.floor(time - lastTime)
          for (let i = 0; i < numSteps; ++i) {
            let force = -config.tension * (position - to)
            let damping = -config.friction * velocity
            let acceleration = (force + damping) / config.mass
            velocity = velocity + (acceleration * 1) / 1000
            position = position + (velocity * 1) / 1000
          }

          // Conditions for stopping the spring animation
          let isOvershooting =
            config.clamp && config.tension !== 0
              ? from < to
                ? position > to
                : position < to
              : false
          let isVelocity = Math.abs(velocity) <= config.precision
          let isDisplacement =
            config.tension !== 0
              ? Math.abs(to - position) <= config.precision
              : true
          endOfAnimation = isOvershooting || (isVelocity && isDisplacement)
          animation.lastVelocity = velocity
          animation.lastTime = time
        }

        // Trails aren't done until their parents conclude
        if (isAnimated && !config.toValues[valIdx].done) endOfAnimation = false

        if (endOfAnimation) {
          // Ensure that we end up with a round value
          if (animation.value !== to) position = to
          animation.done = true
        } else isDone = false

        animation.updateValue(position)
        animation.lastPosition = position
      }

      // Keep track of updated values only when necessary
      if (controller.props.onFrame || !controller.props.native)
        controller.animatedProps[config.name] = config.interpolation.getValue()
    }
    // Update callbacks in the end of the frame
    if (controller.props.onFrame || !controller.props.native) {
      if (!controller.props.native && controller.onUpdate) controller.onUpdate()
      if (controller.props.onFrame)
        controller.props.onFrame(controller.animatedProps)
    }
    // Either call onEnd or next frame
    if (isDone) {
      controllers.delete(controller)
      controller.debouncedOnEnd({ finished: true, noChange })
    }
  }

  // Loop over as long as there are controllers ...
  if (controllers.size) requestFrame(frameLoop)
  else active = false
}

const addController = controller => {
  if (!controllers.has(controller)) {
    controllers.add(controller)
    if (!active) requestFrame(frameLoop)
    active = true
  }
}

const removeController = controller => {
  if (controllers.has(controller)) {
    controllers.delete(controller)
  }
}

export { addController, removeController }
