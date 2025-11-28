import './Preloader.css';

function Preloader() {
  return (
    <div className="preloader">
      <div className="preloader-content">
        <div className="spinner">
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
          <div className="spinner-ring"></div>
        </div>
        <div className="preloader-text">Загрузка...</div>
      </div>
    </div>
  );
}

export default Preloader;

