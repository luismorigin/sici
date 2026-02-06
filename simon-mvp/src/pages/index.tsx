// simonbo.com (/) muestra la landing premium
// La landing original está en /landing-old si se necesita
import LandingV2 from './landing-v2'
import type { GetStaticProps } from 'next'
import { fetchLandingData, type LandingData } from '@/lib/landing-data'

export default LandingV2

export const getStaticProps: GetStaticProps<LandingData> = async () => {
  const data = await fetchLandingData()
  return {
    props: data,
    revalidate: 21600, // 6 horas
  }
}
