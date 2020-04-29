import {
  defineComponent,
  h,
  PropType,
  inject,
  computed,
  reactive,
  unref,
  Component,
} from 'vue'
import { RouteLocationRaw, VueUseOptions, RouteLocation } from './types'
import { isSameLocationObject, isSameRouteRecord } from './location'
import { routerKey, routeLocationKey } from './injectionSymbols'
import { RouteRecord } from './matcher/types'

interface LinkProps {
  to: RouteLocationRaw
  // TODO: refactor using extra options allowed in router.push
  replace?: boolean
}

type UseLinkOptions = VueUseOptions<LinkProps>

// TODO: we could allow currentRoute as a prop to expose `isActive` and
// `isExactActive` behavior should go through an RFC
export function useLink(props: UseLinkOptions) {
  const router = inject(routerKey)!
  const currentRoute = inject(routeLocationKey)!

  const route = computed(() => router.resolve(unref(props.to)))

  const activeRecordIndex = computed<number>(() => {
    let { matched } = route.value
    let { length } = matched
    const routeMatched: RouteRecord | undefined = matched[length - 1]
    let currentMatched = currentRoute.matched
    if (!routeMatched || !currentMatched.length) return -1
    let index = currentMatched.findIndex(
      isSameRouteRecord.bind(null, routeMatched)
    )
    if (index > -1) return index
    // possible parent record
    let parentRecord = matched[length - 2]
    if (
      length > 1 &&
      // if the have the same path, this link is referring to the empty child
      // are we currently are on a different child of the same parent
      routeMatched.path === parentRecord.path &&
      // avoid comparing the child with its parent
      currentMatched[currentMatched.length - 1].path !== parentRecord.path
    )
      return currentMatched.findIndex(
        isSameRouteRecord.bind(null, matched[length - 2])
      )
    return index
  })

  const isActive = computed<boolean>(
    () =>
      activeRecordIndex.value > -1 &&
      includesParams(currentRoute.params, route.value.params)
  )
  const isExactActive = computed<boolean>(
    () =>
      activeRecordIndex.value > -1 &&
      activeRecordIndex.value === currentRoute.matched.length - 1 &&
      isSameLocationObject(currentRoute.params, route.value.params)
  )

  function navigate(e: MouseEvent = {} as MouseEvent): Promise<any> {
    if (guardEvent(e))
      return router[unref(props.replace) ? 'replace' : 'push'](unref(props.to))
    return Promise.resolve()
  }

  return {
    route,
    href: computed(() => route.value.href),
    isActive,
    isExactActive,
    navigate,
  }
}

export const RouterLink = (defineComponent({
  name: 'RouterLink',
  props: {
    to: {
      type: [String, Object] as PropType<RouteLocationRaw>,
      required: true,
    },
    activeClass: {
      type: String,
      default: 'router-link-active',
    },
    exactActiveClass: {
      type: String,
      default: 'router-link-exact-active',
    },
    custom: Boolean,
  },

  setup(props, { slots, attrs }) {
    const link = reactive(useLink(props))

    const elClass = computed(() => ({
      [props.activeClass]: link.isActive,
      [props.exactActiveClass]: link.isExactActive,
    }))

    return () => {
      const children = slots.default && slots.default(link)
      return props.custom
        ? children
        : h(
            'a',
            {
              'aria-current': link.isExactActive ? 'page' : null,
              onClick: link.navigate,
              href: link.href,
              ...attrs,
              class: elClass.value,
            },
            children
          )
    }
  },
}) as unknown) as Component

function guardEvent(e: MouseEvent) {
  // don't redirect with control keys
  if (e.metaKey || e.altKey || e.ctrlKey || e.shiftKey) return
  // don't redirect when preventDefault called
  if (e.defaultPrevented) return
  // don't redirect on right click
  if (e.button !== undefined && e.button !== 0) return
  // don't redirect if `target="_blank"`
  // @ts-ignore getAttribute does exist
  if (e.currentTarget && e.currentTarget.getAttribute) {
    // @ts-ignore getAttribute exists
    const target = e.currentTarget.getAttribute('target')
    if (/\b_blank\b/i.test(target)) return
  }
  // this may be a Weex event which doesn't have this method
  if (e.preventDefault) e.preventDefault()

  return true
}

function includesParams(
  outer: RouteLocation['params'],
  inner: RouteLocation['params']
): boolean {
  for (let key in inner) {
    let innerValue = inner[key]
    let outerValue = outer[key]
    if (typeof innerValue === 'string') {
      if (innerValue !== outerValue) return false
    } else {
      if (
        !Array.isArray(outerValue) ||
        outerValue.length !== innerValue.length ||
        innerValue.some((value, i) => value !== outerValue[i])
      )
        return false
    }
  }

  return true
}