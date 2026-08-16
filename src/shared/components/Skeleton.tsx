export function SidebarSkeleton({rows=7,className=''}:{rows?:number;className?:string}){
  return <div className={`skeleton-sidebar ${className}`} aria-label="正在加载" aria-busy="true">{Array.from({length:rows},(_,index)=><div className="skeleton-row" key={index}><span className="skeleton-block skeleton-icon"/><span className="skeleton-block skeleton-line" style={{width:`${58+(index%3)*11}%`}}/><span className="skeleton-block skeleton-count"/></div>)}</div>
}

export function ContentSkeleton({cards=4,className=''}:{cards?:number;className?:string}){
  return <div className={`skeleton-content ${className}`} aria-label="正在加载内容" aria-busy="true"><span className="skeleton-block skeleton-title"/><span className="skeleton-block skeleton-subtitle"/><div className="skeleton-card-grid">{Array.from({length:cards},(_,index)=><div className="skeleton-card" key={index}><span className="skeleton-block skeleton-card-media"/><span className="skeleton-block skeleton-card-line wide"/><span className="skeleton-block skeleton-card-line"/></div>)}</div></div>
}
