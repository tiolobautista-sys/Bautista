import { useState } from 'react'
import '../App.css'
export default function Sample(){

   const [x, y] = useState(10)
    const [value1, setValue1] = useState(1)
    const [value2, setValue2] = useState(2)
    const [value3, setValue3] = useState(3)
    const [operator, setOperator] = useState('+')
    return (
    <div className = 'overall'>
      <div className='subCont'>

        <div className='leftl'>
      <div className = 'top'>
        <input onChange = {(e) => setValue1(parseInt(e.target.value))}/>
        <input onChange = {(e) => setValue2(parseInt(e.target.value))}/>
       
      </div>
      <div className='sub1Cont'>

        <div className ='addCont'
            onClick={() => setValue3(value1 + value2)}>
         <h1>+</h1>

        </div>
        <div className='minusCont'
            onClick={() => setValue3(value1 - value2)}>
        <h1>-</h1>
        </div>
         </div>
         <div className='botsubCont'>

         <div className='multiCont'
          onClick={() => setValue3(value1 * value2)}>
            <h1>*</h1>
        </div>

        <div className='divCont'
        onClick={() => setValue3(value1 / value2)}>
          <h1>/</h1>
            </div>

          </div>
          </div>

        <div className='rights'>
          <div className='value'>
            <h1>values</h1>
            <div className='equation'>
              <h2>{value1}</h2>
             
              <h2>{value2}</h2>
            </div>

            <hr style={{width: '100%'}}/>
            <div className='result'>
              <h2>{value3}</h2>
              </div>
            </div>
            </div>
          </div>
      </div>
    )
}